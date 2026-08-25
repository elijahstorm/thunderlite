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
 *
 * The response also carries a `lag` rollup, because the raw trace is the wrong
 * shape for the question "was this match smooth". A relay's cost and a client's
 * backlog are per-action numbers scattered through thousands of entries; what a
 * reader wants is the distribution, per player, and the worst backlog either of
 * them reached. See `summarizeLag`.
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
		// `db/write` as the fallback attribution: the append dominates this path,
		// and the membership read in front of it is one call. A refusal that names
		// its own scope still wins.
		noteRateLimit(msg, 'db/write')
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
		lag: summarizeLag(entries, who),
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

/** Nearest-rank percentile over an already-sorted ascending list. */
const percentile = (sorted: number[], p: number): number =>
	sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]

/**
 * Roll the `perf` entries up into the shape the question is actually asked in.
 *
 * Two families of number, and keeping them apart is the point. `relayMs` and
 * `calls` describe what it cost this client to get one run of actions into the
 * log — the sender's side. `owed` and `logLag` describe how far behind that left
 * somebody: actions applied locally that the room has not accepted, and events
 * in the log this client has not applied. A room can show healthy relays and a
 * terrible backlog, which is exactly what a client relaying a CPU side's whole
 * turn looks like, and a latency-only summary would have called it fine.
 *
 * `callsPerAction` is the one to read first. The gateway budgets calls per
 * namespace per minute across the whole project, so it — not milliseconds — is
 * what caps how many actions a room can push through in a minute.
 */
const summarizeLag = (
	entries: { userSession: string; kind: string; detail: unknown; ts: number }[],
	who: (session: string) => string
) => {
	type Acc = {
		relays: number
		actions: number
		settled: number
		calls: number
		callSamples: number
		relayMs: number[]
		maxOwed: number
		maxLogLag: number
		batched: number
		gauges: number
		catchingUp: number
	}
	const blank = (): Acc => ({
		relays: 0,
		actions: 0,
		settled: 0,
		calls: 0,
		callSamples: 0,
		relayMs: [],
		maxOwed: 0,
		maxLogLag: 0,
		batched: 0,
		gauges: 0,
		catchingUp: 0,
	})
	const byPlayer = new Map<string, Acc>()
	let first = Infinity
	let last = 0

	for (const entry of entries) {
		if (entry.kind !== 'perf') continue
		const detail = entry.detail as Record<string, unknown> | null
		if (!detail) continue
		const key = who(entry.userSession)
		const acc = byPlayer.get(key) ?? blank()
		byPlayer.set(key, acc)
		first = Math.min(first, entry.ts)
		last = Math.max(last, entry.ts)
		const num = (field: string): number | null => {
			const value = detail[field]
			return typeof value === 'number' && Number.isFinite(value) ? value : null
		}
		acc.maxOwed = Math.max(acc.maxOwed, num('owed') ?? 0)
		acc.maxLogLag = Math.max(acc.maxLogLag, num('logLag') ?? 0)
		if (detail.what === 'gauge') {
			acc.gauges += 1
			if (detail.catchingUp === true) acc.catchingUp += 1
		}
		if (detail.what !== 'relay') continue
		acc.relays += 1
		const actions = num('actions') ?? 1
		acc.actions += actions
		acc.settled += num('settled') ?? 0
		if (actions > 1) acc.batched += 1
		const ms = num('relayMs')
		if (ms !== null) acc.relayMs.push(ms)
		const calls = num('calls')
		if (calls !== null) {
			acc.calls += calls
			acc.callSamples += actions
		}
	}

	const players = [...byPlayer.entries()]
		.map(([player, acc]) => {
			const sorted = [...acc.relayMs].sort((a, b) => a - b)
			return {
				player,
				relays: acc.relays,
				actions: acc.actions,
				settled: acc.settled,
				/** Share of relays that carried more than one action. */
				batchedShare: acc.relays > 0 ? Number((acc.batched / acc.relays).toFixed(2)) : 0,
				actionsPerRelay: acc.relays > 0 ? Number((acc.actions / acc.relays).toFixed(2)) : 0,
				relayP50: percentile(sorted, 0.5),
				relayP95: percentile(sorted, 0.95),
				relayMax: sorted.length ? sorted[sorted.length - 1] : 0,
				callsPerAction:
					acc.callSamples > 0 ? Number((acc.calls / acc.callSamples).toFixed(2)) : null,
				maxOwed: acc.maxOwed,
				maxLogLag: acc.maxLogLag,
				/**
				 * Share of gauge ticks where the queue had given up on animating and was
				 * fast-forwarding. This is the number that means "behind", as opposed to
				 * `maxLogLag`, which a spectator legitimately runs while watching a turn
				 * play out.
				 */
				catchingUpShare: acc.gauges > 0 ? Number((acc.catchingUp / acc.gauges).toFixed(2)) : 0,
			}
		})
		.sort((a, b) => b.maxLogLag + b.maxOwed - (a.maxLogLag + a.maxOwed))

	return {
		players,
		/** Worst backlog anyone reached, which is the headline for a whole room. */
		worstOwed: players.reduce((worst, p) => Math.max(worst, p.maxOwed), 0),
		worstLogLag: players.reduce((worst, p) => Math.max(worst, p.maxLogLag), 0),
		/** The headline that actually means trouble — see `catchingUpShare`. */
		worstCatchingUpShare: players.reduce((worst, p) => Math.max(worst, p.catchingUpShare), 0),
		spanMs: Number.isFinite(first) ? last - first : 0,
	}
}
