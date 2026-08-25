import { error, isHttpError, json } from '@sveltejs/kit'
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
 *    *re-derive* the winner is future hardening — but the round count IS now
 *    derived from the log rather than claimed, and a claim the log outright
 *    contradicts is refused; see `logSummary`.)
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

	// The caller's own round count. Only ever a FALLBACK online (see below): it is
	// this client's `gameState.turnNumber`, which no other client can verify.
	const turnsNum = Number(body.turns)
	const claimedTurns = Number.isFinite(turnsNum) ? Math.max(0, Math.trunc(turnsNum)) : 0
	const mapSha = typeof body.mapSha === 'string' ? body.mapSha : null
	const claimedWinner = body.winner === null ? null : asTeam(body.winner)

	try {
		let winnerTeam: number | null
		let outcome: Outcome
		let matchId: number | undefined
		let isAsyncMatch = false
		let turns = claimedTurns

		if (mode === 'online') {
			const members = await gameStore.members(session)
			if (members.length === 0 || !members.includes(userSession)) {
				throw error(403, 'Not a member of this game session')
			}

			// The played map, read from the room row (which outlives its logical
			// TTL) and pinned onto the match so the replay viewer can rebuild the
			// board long after the room itself is gone. The room's own mode rides
			// along: only async matches get a result email (see below).
			const room = await db.findOne<{ map_id: string | null; mode: string | null }>('game_room', {
				where: { session },
				select: ['map_id', 'mode'],
			})
			isAsyncMatch = room?.mode === 'async'

			// Round count and log position, derived from the room's own event log
			// rather than taken from this client's engine — which is the one number
			// in this payload that provably went wrong in match 19 (row: 46 rounds,
			// log: 24). The claim stands in only if the log can't be read.
			let lastEventId: number | null = null
			try {
				const summary = await gameStore.logSummary(session)
				turns = summary.rounds
				lastEventId = summary.lastEventId
				// A side that quit cannot have won it. This is the one part of the
				// winner claim the server can check on its own — the log records every
				// surrender, but an elimination in combat leaves no event at all, so
				// the rest of the claim still has to be taken on trust.
				if (claimedWinner !== null && summary.surrendered.has(claimedWinner)) {
					await logToErrorDb(
						`Result claim for ${session} names team ${claimedWinner} as winner, but the log records its surrender`
					)
					throw error(409, 'That result contradicts the match log')
				}
			} catch (msg) {
				if (isHttpError(msg)) throw msg
				// Diagnostics and a derived count must never cost an already-finished
				// match its row; fall back to the caller's claim.
				await logToErrorDb(msg, 'Could not derive match turns from the event log')
			}

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
				last_event_id: lastEventId,
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
						await logToErrorDb(msg)
					}
				}
			} else {
				const existing = await db.findOne<{ id: number; winner_team: number | null }>('matches', {
					where: { session_id: session },
					select: ['id', 'winner_team'],
				})
				matchId = existing?.id
				winnerTeam = existing ? (existing.winner_team ?? null) : null
				// Two participants who watched the same match should not disagree about
				// who won it. When they do, one of their boards diverged from the room
				// and the recorded winner is a coin flip on who POSTed first — exactly
				// what match 19 looks like from the outside. The locked row stands (an
				// elo settlement already hangs off it), but the disagreement is worth
				// knowing about instead of being silently resolved by arrival order.
				if (existing && claimedWinner !== winnerTeam) {
					await logToErrorDb(
						`Result conflict for ${session}: locked winner ${winnerTeam}, team ${team} claims ${claimedWinner}`
					)
				}
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

		// Read the ladder movement back off the player rows settlement just stamped
		// — every human seat, not only the caller's — so the end-of-game report can
		// show both sides' "1212 → 1224" instead of making anyone go find it on a
		// profile. `elo` stays the caller's own movement for callers that only care
		// about themselves. Empty for anything unrated, and empty too in the rare
		// race where a non-locking writer arrives before the locking writer's
		// settlement lands — the profile still shows it either way, so this is a
		// bonus, not a source of truth.
		let elo: { before: number; delta: number } | null = null
		let ratings: { team: number; before: number; delta: number }[] = []
		if (mode === 'online') {
			type SettledRow = {
				user_auth: string
				team: number | null
				elo_before: number | null
				elo_delta: number | null
			}
			const settled = await db
				.find<SettledRow>('match_players', {
					where: { match_id: matchId },
					select: ['user_auth', 'team', 'elo_before', 'elo_delta'],
				})
				.catch(() => [] as SettledRow[])

			ratings = settled
				.filter((row) => row.elo_before != null && row.team != null)
				.map((row) => ({
					team: Number(row.team),
					before: Number(row.elo_before),
					delta: Number(row.elo_delta ?? 0),
				}))

			const own = settled.find((row) => row.user_auth === userAuth)
			if (own?.elo_before != null) {
				elo = { before: Number(own.elo_before), delta: Number(own.elo_delta ?? 0) }
			}
		}

		// The match is over — release this player's "current room" pointer so the
		// finished game stops showing as their active session and they can start a
		// new one. Only clears if it still points here (a rematch already moved it).
		if (mode === 'online') await gameStore.clearPlayerGame(userSession, session)
		// An async room also stops its turn clock now, so the deadline enforcement
		// (cron and lazy checks) never resigns anyone in an already-decided game.
		if (mode === 'online') await gameStore.finishAsyncRoom(session)

		await rememberEmail(userAuth, locals.userEmail)

		// Match summary email, async matches only. A live game ends with both
		// players watching the game-over screen, so mailing them the result they
		// just saw is noise; an async opponent may be days away from opening the
		// app, and the result is genuinely news to them. Each participant records
		// their own result row, so this reaches every player once (deduped per
		// match + player).
		if (isAsyncMatch) {
			const others = await gameStore.roster(session)
			const other = others.find((m) => m.userAuth && m.userAuth !== userAuth && !m.isAi)
			const opponentName = other?.userAuth ? await profileName(other.userAuth) : null
			await notify({
				userAuth,
				category: 'game',
				dedupKey: `match-result:${matchId}:${userAuth}`,
				email: locals.userEmail,
				content: matchResult(outcome, opponentName, matchId),
			})
		}

		return json({ matchId, outcome, elo, ratings })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		await logToErrorDb(msg)
		throw error(500, 'Could not persist match result')
	}
}
