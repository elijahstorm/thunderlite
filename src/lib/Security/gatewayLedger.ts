/**
 * gatewayLedger — how many gateway calls this app is actually spending, and on
 * what (server-only).
 *
 * `rateLimit.ts` tracks what the gateway TELLS us about each namespace's budget:
 * the headroom on the last counted response, and any cooldown we were handed.
 * That is the view from outside. This is the view from inside — every call the
 * app makes, attributed to the route that made it — and the two answer different
 * questions. Headroom says "we are close to the ceiling"; the ledger says "and
 * the reason is that two idle clients are spending 400 db calls a minute on a
 * poll that finds nothing."
 *
 * That distinction is the whole point. The database is budgeted at 900
 * reads/min and 300 writes/min for the entire project, and the cost of a game is
 * dominated not by how slow any single call is but by how MANY the sync path
 * makes:
 *
 *   /events poll     roster + events + getRoom (+ clientSeq)   every 1.5s/client
 *   /heartbeat       isMember + touch + getRoom + sweep        every 10s/client
 *   /move            preflight reads + append + publish        per action
 *
 * A room where the host is relaying an AI side's whole turn one action at a time
 * therefore does not fail because the gateway got slower. It fails on volume.
 * Splitting the database budget by direction took the worst version of that off
 * the table — a poll loop can no longer spend the budget an append needed — but
 * it did not make the calls free: the same poll still exhausts its own 900, and
 * each relayed action still costs several writes out of 300. Latency is the
 * symptom; call count is the cause. Nothing else in the app could see which
 * route is spending them, so this exists.
 *
 * Two scopes of measurement, both cheap:
 *
 *   per request — an `AsyncLocalStorage` tally, so a route can report its OWN
 *                 cost in a response header without threading a counter through
 *                 every store helper.
 *   rolling     — 60 one-second buckets of the same counts, module-scoped. On
 *                 Fluid Compute a warm instance keeps these across invocations,
 *                 which makes the window a genuine spend rate for that instance
 *                 rather than a per-request curiosity. A cold instance starts
 *                 empty, the same honest failure mode `rateLimit.ts` chose.
 *
 * Everything here is best-effort accounting. A throw inside the ledger must
 * never reach the call it was measuring, so the recording paths swallow.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { GatewayScope } from './rateLimit'

/** One second of spend, bucketed so the window can roll without a timer. */
type Bucket = {
	/** `Math.floor(epochMs / 1000)` this bucket accounts for. */
	second: number
	byScope: Map<string, number>
	byRoute: Map<string, number>
	/** Summed wall-clock of the calls counted here. */
	ms: number
	failures: number
}

/** How much history the rolling window keeps. One gateway budget window. */
const WINDOW_SECONDS = 60

/**
 * Cap on distinct route keys held in a bucket. Route ids are a closed set, so
 * this is a fence against an unexpected key source (a dynamic label, a bug),
 * not an expected condition.
 */
const MAX_ROUTE_KEYS = 64

const buckets: Bucket[] = []

const nowSecond = (): number => Math.floor(Date.now() / 1000)

const bucketFor = (second: number): Bucket => {
	const last = buckets[buckets.length - 1]
	if (last && last.second === second) return last
	const fresh: Bucket = {
		second,
		byScope: new Map(),
		byRoute: new Map(),
		ms: 0,
		failures: 0,
	}
	buckets.push(fresh)
	// Drop anything that has rolled out of the window. Bounded by construction:
	// one bucket per second, so this can never hold more than WINDOW_SECONDS.
	const cutoff = second - WINDOW_SECONDS
	while (buckets.length && buckets[0].second <= cutoff) buckets.shift()
	return fresh
}

const bump = (map: Map<string, number>, key: string, by: number, cap = Infinity): void => {
	const current = map.get(key)
	if (current === undefined && map.size >= cap) return
	map.set(key, (current ?? 0) + by)
}

// ── Per-request tally ────────────────────────────────────────────────────────

/** What one request spent, accumulated as its handler runs. */
export type RequestSpend = {
	route: string
	calls: number
	ms: number
	failures: number
	byScope: Map<string, number>
}

const requestStore = new AsyncLocalStorage<RequestSpend>()

/**
 * Run `fn` with a fresh per-request tally in scope. Every gateway call made
 * inside it — however deep in the store layer — lands in the same tally, which
 * `requestSpend()` can then read without any call site passing it along.
 */
export const withRequestSpend = <T>(route: string, fn: (spend: RequestSpend) => T): T => {
	const spend: RequestSpend = { route, calls: 0, ms: 0, failures: 0, byScope: new Map() }
	return requestStore.run(spend, () => fn(spend))
}

/** This request's spend so far, or null outside a `withRequestSpend` scope. */
export const requestSpend = (): RequestSpend | null => requestStore.getStore() ?? null

// ── Recording ───────────────────────────────────────────────────────────────

/**
 * Record one gateway call. Called from the adapter in `dontcode/server.ts` for
 * every namespace, successes and failures alike — a refused call still consumed
 * a slot in the budget, and leaving those out would make the ledger optimistic
 * exactly when it matters.
 */
export const noteGatewayCall = (scope: GatewayScope, ms: number, ok: boolean): void => {
	try {
		const spend = requestStore.getStore()
		const route = spend?.route ?? 'background'
		if (spend) {
			spend.calls += 1
			spend.ms += ms
			if (!ok) spend.failures += 1
			bump(spend.byScope, scope, 1)
		}
		const bucket = bucketFor(nowSecond())
		bucket.ms += ms
		if (!ok) bucket.failures += 1
		bump(bucket.byScope, scope, 1)
		bump(bucket.byRoute, route, 1, MAX_ROUTE_KEYS)
	} catch {
		// Accounting must never be able to fail the call it is accounting for.
	}
}

/**
 * The budget the call in flight is drawing on. `AsyncLocalStorage` rather than a
 * module variable because several calls are usually in flight at once and a
 * shared slot would hand one call's answer to another; the store follows each
 * call's own async continuation instead.
 *
 * This exists for one reader: the SDK's `onRateLimit` hook, which fires inside
 * the call. The gateway names the budget it counted in `RateLimit-Scope`, so the
 * hook usually knows already; what it cannot know is which budget a response
 * carrying no scope was drawing on — `POST /api/v1/db` is two budgets behind one
 * path, and a downstream limiter's refusal names neither. The adapter knows
 * which direction it called in, so it can supply what the response left out.
 * See `noteRateLimitStatus`.
 */
const spendingStore = new AsyncLocalStorage<GatewayScope>()

/** The budget being spent by the call in flight, or undefined outside one. */
export const currentGatewayScope = (): GatewayScope | undefined => spendingStore.getStore()

/**
 * Wrap a gateway call so it is timed and counted. Rethrows untouched: the
 * ledger observes, it never changes an outcome.
 */
export const metered = async <T>(scope: GatewayScope, call: () => Promise<T>): Promise<T> => {
	const started = Date.now()
	try {
		const result = await spendingStore.run(scope, call)
		noteGatewayCall(scope, Date.now() - started, true)
		return result
	} catch (err) {
		noteGatewayCall(scope, Date.now() - started, false)
		throw err
	}
}

// ── Reading ─────────────────────────────────────────────────────────────────

export type LedgerWindow = {
	/** Seconds of history actually held (a cold instance has less). */
	seconds: number
	calls: number
	ms: number
	failures: number
	/** Calls per minute, extrapolated from the history actually held. */
	callsPerMinute: number
	byScope: Record<string, number>
	byRoute: Record<string, number>
	/** Per-minute rate by namespace, which is the shape the budget is set in. */
	perMinuteByScope: Record<string, number>
}

const sumMaps = (maps: Map<string, number>[]): Record<string, number> => {
	const total = new Map<string, number>()
	for (const map of maps) for (const [key, value] of map) bump(total, key, value)
	return Object.fromEntries([...total.entries()].sort((a, b) => b[1] - a[1]))
}

/**
 * The rolling window. `seconds` is how much history this instance actually has,
 * and the per-minute rates are extrapolated from it — a warm instance reports a
 * real rate, a cold one reports its best estimate and says how thin it is.
 */
export const ledgerWindow = (): LedgerWindow => {
	const cutoff = nowSecond() - WINDOW_SECONDS
	const live = buckets.filter((b) => b.second > cutoff)
	const calls = live.reduce((sum, b) => sum + [...b.byScope.values()].reduce((a, c) => a + c, 0), 0)
	const ms = live.reduce((sum, b) => sum + b.ms, 0)
	const failures = live.reduce((sum, b) => sum + b.failures, 0)
	// Span, not bucket count: an instance idle for 40 of the last 60 seconds has
	// few buckets but a full window of history, and dividing by the buckets it
	// happened to fill would report a wildly inflated rate.
	const span = live.length ? Math.max(1, nowSecond() - live[0].second + 1) : 0
	const scale = span > 0 ? 60 / span : 0
	const byScope = sumMaps(live.map((b) => b.byScope))
	return {
		seconds: span,
		calls,
		ms,
		failures,
		callsPerMinute: Math.round(calls * scale),
		byScope,
		byRoute: sumMaps(live.map((b) => b.byRoute)),
		perMinuteByScope: Object.fromEntries(
			Object.entries(byScope).map(([scope, count]) => [scope, Math.round(count * scale)])
		),
	}
}

/** Reset the window. Tests only — production wants the warm-instance history. */
export const resetLedger = (): void => {
	buckets.length = 0
}
