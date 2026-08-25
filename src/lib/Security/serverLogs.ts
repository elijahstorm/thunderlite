/**
 * Server error logging.
 *
 * Two rules, learned the hard way from a rate-limit storm:
 *
 * 1. The log always reaches stdout FIRST. Vercel captures the runtime log, so
 *    the console is the record that always survives; the `logs` table is a
 *    queryable convenience on top of it. That ordering is what makes it safe to
 *    drop database writes — dropping one costs a nicer query, never the trace.
 *
 * 2. Logging must never be able to amplify the failure it's reporting. The
 *    `logs` insert is a gateway call on the same account-wide rate limit as
 *    everything else, so under load the old logger did the worst possible
 *    thing: every 429 provoked another write, which 429'd, and each error
 *    handler added a round trip to a request that had already failed. Hence a
 *    circuit breaker, per-message deduplication, a timeout, and an absolute
 *    refusal to write a row about a rate limit.
 */
import { dev } from '$app/environment'
import { db } from '$lib/dontcode/server'
import { gatewayCooldownMs, gatewayThrottled, noteRateLimit } from './rateLimit'

/** Identical messages inside this window collapse into one row with a count. */
const DEDUPE_WINDOW_MS = 60_000
/** Ceiling on distinct messages tracked at once, so the map can't grow forever. */
const MAX_TRACKED_MESSAGES = 500
/**
 * Hard cap on how long a log write may hold up the request that triggered it.
 * The write is still allowed to finish in the background; we simply stop
 * waiting on it. A slow gateway must not turn one failed request into a slow
 * failed request.
 */
const WRITE_TIMEOUT_MS = 1_500

type Seen = { firstAt: number; count: number }
const seen = new Map<string, Seen>()

/**
 * Should this message be written now? First sighting in the window, yes — and
 * the repeats behind it are counted so the next window's row can say how many
 * there were, which is usually the most informative part of a storm.
 */
const shouldWrite = (message: string, at: number): { write: boolean; suppressed: number } => {
	const prior = seen.get(message)
	if (!prior || at - prior.firstAt > DEDUPE_WINDOW_MS) {
		const suppressed = prior ? prior.count : 0
		seen.set(message, { firstAt: at, count: 0 })
		if (seen.size > MAX_TRACKED_MESSAGES) {
			// Oldest-inserted first: Map preserves insertion order, and an entry
			// that hasn't recurred is the one least worth remembering.
			const oldest = seen.keys().next()
			if (!oldest.done) seen.delete(oldest.value)
		}
		return { write: true, suppressed }
	}
	prior.count += 1
	return { write: false, suppressed: 0 }
}

const messageOf = (e: unknown): string => {
	if (e instanceof Error) return e.message
	if (typeof e === 'string') return e || 'Unknown error'
	return `${e}`
}

/**
 * Record a server-side error. Safe to call from any catch block, including one
 * handling a failure of the logging system itself.
 */
export const logToErrorDb = async (e: unknown, info?: string) => {
	const message = (info ? info + ': ' : '') + messageOf(e)

	// Unconditional, and before anything that could throw or be skipped.
	console.error(message, e)
	if (dev) return

	// A rate limit is the one error never worth a row: writing it is another
	// call against the very limit being reported. The console line above is the
	// whole record, and the breaker below is the useful reaction.
	const limit = noteRateLimit(e)
	if (limit.limited) return

	// Already known to be throttled — the write would fail, and failing costs a
	// round trip on a request a player may be waiting on.
	if (gatewayThrottled()) return

	const at = Date.now()
	const { write, suppressed } = shouldWrite(message, at)
	if (!write) return

	// A storm's real signal is its size, so the first row after a quiet period
	// reports how many repeats the previous window swallowed.
	const text = suppressed > 0 ? `${message} (+${suppressed} repeats suppressed)` : message

	try {
		await withTimeout(
			db.insert('logs', { type: 'error', message: text, time: formatPostgresDate(new Date()) })
		)
	} catch (msg) {
		// The breaker: a 429 here parks every subsequent write until the gateway
		// says we're welcome again, which is the difference between one failed
		// write and one per error for the next minute.
		const failure = noteRateLimit(msg)
		if (failure.limited) {
			console.error(
				`Error log suppressed: gateway rate limited for ${Math.ceil(gatewayCooldownMs() / 1000)}s`
			)
			return
		}
		console.error('Could not save error log', msg)
	}
}

/**
 * Resolve either way once the deadline passes. The underlying write is left
 * running rather than aborted — if it lands late, the row is still useful.
 */
const withTimeout = <T>(work: Promise<T>): Promise<T | null> =>
	Promise.race([
		work,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), WRITE_TIMEOUT_MS)),
	])

/** Testing seam: forget the dedupe window. */
export const resetErrorLogState = (): void => seen.clear()

const formatPostgresDate = (date: Date) => {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0') // Months are 0-based
	const day = String(date.getDate()).padStart(2, '0')
	const hours = String(date.getHours()).padStart(2, '0')
	const minutes = String(date.getMinutes()).padStart(2, '0')
	const seconds = String(date.getSeconds()).padStart(2, '0')

	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}
