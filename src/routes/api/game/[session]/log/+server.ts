import { error, isHttpError, json } from '@sveltejs/kit'
import { dev } from '$app/environment'
import { gameStore } from '$lib/Game/store.server'
import { noteRateLimit } from '$lib/Security/rateLimit'

/**
 * Client diagnostic trace for an online room (see `create_game_log.sql.ts`).
 *
 * POST — a batch of observations from one client: what it relayed, what it
 * received (and over which transport), the board digests it computed, chat lines
 * (which are realtime-only and otherwise recorded nowhere), and any action its
 * engine refused to apply. Online play runs no server-side simulation, so this
 * per-client view is the only way to tell WHY two players' boards diverged: the
 * shared `game_event` log looks identical to both of them.
 *
 * Writes are deliberately forgiving. A malformed batch is dropped, a storage
 * failure is swallowed, and the response is always 2xx — a client must never
 * retry, back off, or surface an error because *logging* failed mid-match.
 * The only hard gate is membership: a room's trace is its players' business.
 *
 * GET — read the trace back, grouped for reading. Restricted to the room's own
 * members (or anything in dev), same rule the replay uses: the trace exposes
 * both sides' actions, which a spectator never earned.
 */

export const POST = async ({ request, params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	if (!session) throw error(400, 'Missing session')

	let body: unknown
	try {
		body = await request.json()
	} catch {
		// A malformed beacon (e.g. a truncated unload flush) is not worth an error.
		return json({ stored: 0 })
	}

	const entries = (body as { entries?: unknown })?.entries
	if (!Array.isArray(entries) || entries.length === 0) return json({ stored: 0 })

	try {
		const members = await gameStore.members(session)
		if (members.length === 0 || !members.includes(userSession)) {
			throw error(403, 'Not a member of this game session')
		}
		const stored = await gameStore.appendLog(session, userSession, entries)
		return json({ stored })
	} catch (msg) {
		// `isHttpError`, not a duck-typed `'status' in msg`. That looser check was
		// meant to let our own `error(403)` through untouched, but the SDK's
		// `DontCodeError` carries a `status` too — so a gateway rate limit on this
		// path was re-thrown and rendered as a 500. A logging endpoint answering
		// 500 is precisely the outcome the rest of this file exists to prevent.
		if (isHttpError(msg)) throw msg
		noteRateLimit(msg, 'db')
		// Swallowed on purpose: see the note above. Logging is never load-bearing.
		return json({ stored: 0 })
	}
}

export const GET = async ({ params, locals, url }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	if (!session) throw error(400, 'Missing session')

	const members = await gameStore.members(session)
	if (!dev && (members.length === 0 || !members.includes(userSession))) {
		throw error(403, 'Not a member of this game session')
	}

	const limitRaw = Number(url.searchParams.get('limit'))
	const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(5000, limitRaw) : 1000

	const [entries, log] = await Promise.all([
		gameStore.readLog(session, limit),
		gameStore.events(session, -1),
	])

	// Short, stable aliases for the opaque user-session hashes, so a two-client
	// trace reads as "A did this, B saw that" instead of two walls of hex.
	const alias = new Map<string, string>()
	members.forEach((member, index) => alias.set(member, `P${index + 1}`))
	const who = (s: string) => alias.get(s) ?? `${s.slice(0, 6)}…`

	// The desync check the whole table exists for: for each event id, collect every
	// client's reported board digest. More than one distinct digest at the same id
	// means those clients had provably different boards at that point in the log.
	const digests = new Map<number, Map<string, string>>()
	for (const entry of entries) {
		if (entry.kind !== 'state') continue
		const digest = (entry.detail as { digest?: string })?.digest
		if (!digest) continue
		if (!digests.has(entry.eventId)) digests.set(entry.eventId, new Map())
		digests.get(entry.eventId)!.set(who(entry.userSession), digest)
	}
	const divergences = [...digests.entries()]
		.filter(([, byClient]) => new Set(byClient.values()).size > 1)
		.map(([eventId, byClient]) => ({ eventId, byClient: Object.fromEntries(byClient) }))
		.sort((a, b) => a.eventId - b.eventId)

	return json({
		session,
		players: Object.fromEntries(alias),
		// The first id two clients disagreed on — the action to look at first.
		firstDivergenceEventId: divergences.length ? divergences[0].eventId : null,
		divergences,
		desyncs: entries
			.filter((e) => e.kind === 'desync')
			.map((e) => ({ at: e.eventId, by: who(e.userSession), ...(e.detail as object) })),
		eventCount: log.events.length,
		entries: entries.map((e) => ({
			id: e.id,
			by: who(e.userSession),
			kind: e.kind,
			eventId: e.eventId,
			ts: e.ts,
			detail: e.detail,
		})),
	})
}
