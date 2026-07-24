import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { db } from '$lib/dontcode/server'
import { gameStore } from '$lib/Game/store.server'
import { settleOnlineMatch } from '$lib/Game/matchSettlement.server'
import { notify, profileName, rememberEmail } from '$lib/Notifications/email.server'
import { matchResult } from '$lib/Notifications/templates'

/**
 * POST /api/game/[session]/result — persist a finished match (J3).
 *
 * This is the server side of `recordMatch`. Two shapes flow through it:
 *
 *  - mode 'online': the caller must be a member of the H2 game session. The
 *    winning team is locked by the FIRST writer via the `matches.session_id`
 *    unique constraint — that writer's row carries the authoritative
 *    `winner_team`, and every later writer reads it back, so all participants
 *    record one consistent winner rather than each client's own claim. (This
 *    is the lock that used to live in KV; the unique constraint now serves the
 *    same purpose with no separate store. Replaying the H2 event log to
 *    *re-derive* the winner is future hardening.)
 *  - mode 'hotseat' | 'campaign': there is no shared session, so we record only
 *    the signed-in caller's own row. The `session` path segment is ignored.
 *
 * Idempotent: the `matches.session_id` unique constraint collapses repeat
 * online POSTs to one match row, and `match_players (match_id, user_auth)`
 * collapses repeat per-player POSTs to one player row.
 *
 * The winner-locking writer additionally settles the match once (see
 * matchSettlement.server.ts): player rows for every human seat and elo for
 * rated 1v1s, so absent opponents still get their result recorded.
 */

type Outcome = 'win' | 'loss' | 'draw'
const isOutcome = (v: unknown): v is Outcome => v === 'win' || v === 'loss' || v === 'draw'

const asTeam = (v: unknown): number | null => (Number.isInteger(v) ? (v as number) : null)
const outcomeFor = (winner: number | null, team: number): Outcome =>
	winner === null ? 'draw' : winner === team ? 'win' : 'loss'

export const POST = async ({ request, params, locals }) => {
	const userSession = locals.session
	const userAuth = locals.user
	if (!userSession || !userAuth) throw error(401, 'User not logged in')

	const session = params.session
	if (!session) throw error(400, 'Missing session')

	let parsed: unknown
	try {
		parsed = await request.json()
	} catch {
		throw error(400, 'Invalid JSON body')
	}
	const body = (parsed ?? {}) as Record<string, unknown>

	const mode = body.mode
	if (mode !== 'online' && mode !== 'hotseat' && mode !== 'campaign') {
		throw error(400, 'Invalid mode')
	}

	const team = asTeam(body.team)
	if (team === null) throw error(400, 'Invalid team')

	const turnsNum = Number(body.turns)
	const turns = Number.isFinite(turnsNum) ? Math.max(0, Math.trunc(turnsNum)) : 0
	const mapSha = typeof body.mapSha === 'string' ? body.mapSha : null
	const claimedWinner = body.winner === null ? null : asTeam(body.winner)

	try {
		let winnerTeam: number | null
		let outcome: Outcome
		let matchId: number | undefined

		if (mode === 'online') {
			const members = await gameStore.members(session)
			if (members.length === 0 || !members.includes(userSession)) {
				throw error(403, 'Not a member of this game session')
			}

			// The played map, read from the room row (which outlives its logical
			// TTL) and pinned onto the match so the replay viewer can rebuild the
			// board long after the room itself is gone.
			const room = await db.findOne<{ map_id: string | null }>('game_room', {
				where: { session },
				select: ['map_id'],
			})

			// The first writer locks the winner: their row carries the
			// authoritative `winner_team`. A later writer hits the `session_id`
			// unique constraint, reads that row back, and records the same winner.
			const inserted = await db.insertIgnoreConflict('matches', {
				session_id: session,
				map_sha: mapSha,
				map_id: room?.map_id ?? null,
				mode,
				winner_team: claimedWinner,
				turns,
			})
			if (inserted) {
				matchId = inserted.id as number | undefined
				winnerTeam = claimedWinner
				// Winner locked by THIS writer — settle once: history rows for every
				// human seat and elo for rated 1v1s. Best-effort; a settlement failure
				// must not 500 an already-recorded result (the caller's own row still
				// lands via the insert below, and stats degrade to unrated).
				if (typeof matchId === 'number') {
					try {
						await settleOnlineMatch({ matchId, session, winnerTeam })
					} catch (msg) {
						logToErrorDb(msg)
					}
				}
			} else {
				const existing = await db.findOne<{ id: number; winner_team: number | null }>('matches', {
					where: { session_id: session },
					select: ['id', 'winner_team'],
				})
				matchId = existing?.id
				winnerTeam = existing ? (existing.winner_team ?? null) : null
			}
			outcome = outcomeFor(winnerTeam, team)
		} else {
			// Hot-seat / campaign: trust the local client and store its own row only.
			if (!isOutcome(body.outcome)) throw error(400, 'Invalid outcome')
			outcome = body.outcome
			winnerTeam = claimedWinner
			const inserted = await db.insert('matches', {
				map_sha: mapSha,
				mode,
				winner_team: winnerTeam,
				turns,
			})
			matchId = inserted.id as number | undefined
		}

		if (matchId === undefined) throw error(500, 'Could not persist match')

		await db.insertIgnoreConflict('match_players', {
			match_id: matchId,
			user_auth: userAuth,
			team,
			outcome,
		})

		// The match is over — release this player's "current room" pointer so the
		// finished game stops showing as their active session and they can start a
		// new one. Only clears if it still points here (a rematch already moved it).
		if (mode === 'online') await gameStore.clearPlayerGame(userSession, session)
		// An async room also stops its turn clock now, so the deadline enforcement
		// (cron and lazy checks) never resigns anyone in an already-decided game.
		if (mode === 'online') await gameStore.finishAsyncRoom(session)

		// Match summary email. Each participant records their own result row, so
		// this reaches every player once (deduped per match + player). For online
		// play we name an opponent; hot-seat / campaign has none.
		let opponentName: string | null = null
		if (mode === 'online') {
			const others = await gameStore.roster(session)
			const other = others.find((m) => m.userAuth && m.userAuth !== userAuth && !m.isAi)
			if (other?.userAuth) opponentName = await profileName(other.userAuth)
		}
		await rememberEmail(userAuth, locals.userEmail)
		await notify({
			userAuth,
			category: 'game',
			dedupKey: `match-result:${matchId}:${userAuth}`,
			email: locals.userEmail,
			content: matchResult(outcome, opponentName),
		})

		return json({ matchId, outcome })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not persist match result')
	}
}
