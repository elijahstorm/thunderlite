import { error, json } from '@sveltejs/kit'
import { KV_REST_API_TOKEN, KV_REST_API_URL } from '$env/static/private'
import { createClient } from '@vercel/kv'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

/**
 * POST /api/game/[session]/result — persist a finished match (J3).
 *
 * This is the server side of `recordMatch`. Two shapes flow through it:
 *
 *  - mode 'online': the caller must be a member of the H2 KV game session. The
 *    winning team is locked into KV by the first writer and every later writer
 *    reads that locked value, so all participants record one consistent winner
 *    derived from server state rather than each client's own claim. (Replaying
 *    the H2 event log to *re-derive* the winner is future hardening; the lock
 *    already prevents a divergent late claim.)
 *  - mode 'hotseat' | 'campaign': there is no shared session, so we record only
 *    the signed-in caller's own row. The `session` path segment is ignored.
 *
 * Idempotent: the `matches.session_id` unique constraint collapses repeat
 * online POSTs to one match row, and `match_players (match_id, user_auth)`
 * collapses repeat per-player POSTs to one player row.
 */

const MEMBERS_KEY = (session: string) => `game:${session}`
const RESULT_KEY = (session: string) => `game-result:${session}`
const RESULT_TTL_SECONDS = 60 * 60 * 24

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
		let sessionId: string | null

		if (mode === 'online') {
			const kv = createClient({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN })
			const members = ((await kv.smembers(MEMBERS_KEY(session))) as string[] | null) ?? []
			if (members.length === 0 || !members.includes(userSession)) {
				throw error(403, 'Not a member of this game session')
			}

			// First writer locks the winner; everyone else reads it back.
			await kv.set(
				RESULT_KEY(session),
				{ winner: claimedWinner },
				{
					nx: true,
					ex: RESULT_TTL_SECONDS,
				}
			)
			const lockedRaw = (await kv.get(RESULT_KEY(session))) as
				| string
				| { winner: number | null }
				| null
			const locked =
				typeof lockedRaw === 'string'
					? (JSON.parse(lockedRaw) as { winner: number | null })
					: (lockedRaw ?? { winner: claimedWinner })

			winnerTeam = typeof locked.winner === 'number' ? locked.winner : null
			outcome = outcomeFor(winnerTeam, team)
			sessionId = session
		} else {
			// Hot-seat / campaign: trust the local client and store its own row only.
			if (!isOutcome(body.outcome)) throw error(400, 'Invalid outcome')
			outcome = body.outcome
			winnerTeam = claimedWinner
			sessionId = null
		}

		let matchId: number | undefined
		if (sessionId) {
			const inserted = (await locals.sql`
				insert into matches ${locals.sql({ session_id: sessionId, map_sha: mapSha, mode, winner_team: winnerTeam, turns })}
				on conflict (session_id) do nothing
				returning id`) as unknown as { id: number }[]
			matchId = inserted[0]?.id
			if (matchId === undefined) {
				const existing = (await locals.sql`
					select id from matches where session_id = ${sessionId}`) as unknown as { id: number }[]
				matchId = existing[0]?.id
			}
		} else {
			const inserted = (await locals.sql`
				insert into matches ${locals.sql({ map_sha: mapSha, mode, winner_team: winnerTeam, turns })}
				returning id`) as unknown as { id: number }[]
			matchId = inserted[0]?.id
		}

		if (matchId === undefined) throw error(500, 'Could not persist match')

		await locals.sql`
			insert into match_players ${locals.sql({ match_id: matchId, user_auth: userAuth, team, outcome })}
			on conflict (match_id, user_auth) do nothing`

		return json({ matchId, outcome })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(locals.sql)(msg)
		throw error(500, 'Could not persist match result')
	}
}
