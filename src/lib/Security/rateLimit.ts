/**
 * Gateway rate-limit awareness (server-only).
 *
 * Every DontCode service call shares one account-wide rate limit, so a burst on
 * any single feature throttles all of them at once. When that happens the SDK
 * throws a `DontCodeError` carrying exactly what we need to react well:
 *
 *   { status: 429, body: { rate_limit: true, timeleft: 56 } }
 *
 * `timeleft` is the difference between guessing and knowing. It lets the server
 * stop making calls it already knows will fail, and lets the client show a
 * countdown instead of a spinner — "back in 42s" reads as scheduled, where an
 * indefinite spinner reads as broken.
 *
 * The cooldown is module state, which on Fluid Compute survives across
 * invocations on a warm instance. That makes it a genuine circuit breaker for
 * the busy instance rather than a per-request curiosity. A cold instance simply
 * starts unaware and learns from its first 429, which is the correct failure
 * mode: pessimism never outlives the instance that earned it.
 */
import { isDontCodeError } from '$lib/dontcode/server'

/** What a caught error says about the rate limit, if anything. */
export type RateLimitInfo = {
	limited: boolean
	/** How long the gateway said to wait, in ms. 0 when it didn't say. */
	retryAfterMs: number
}

const NOT_LIMITED: RateLimitInfo = { limited: false, retryAfterMs: 0 }

/**
 * Read a caught error as a rate-limit verdict. Recognises both the explicit
 * `rate_limit` flag and a bare 429, since only the former carries `timeleft`.
 */
export const rateLimitOf = (err: unknown): RateLimitInfo => {
	if (!isDontCodeError(err)) return NOT_LIMITED
	const body = err.body as { rate_limit?: boolean; timeleft?: number } | undefined
	const limited = err.status === 429 || body?.rate_limit === true
	if (!limited) return NOT_LIMITED
	const seconds = typeof body?.timeleft === 'number' && body.timeleft > 0 ? body.timeleft : 0
	return { limited: true, retryAfterMs: Math.min(seconds, MAX_COOLDOWN_SECONDS) * 1000 }
}

/** Sanity fence on a gateway-supplied cooldown, so one bad number can't park us. */
const MAX_COOLDOWN_SECONDS = 120
/** Assumed cooldown when we're throttled but told nothing about for how long. */
const DEFAULT_COOLDOWN_MS = 15_000

let cooldownUntil = 0

/**
 * Record that the gateway is throttling us. Called from wherever a 429 is
 * caught; the longest known cooldown wins, so one endpoint learning about a
 * 56-second wait isn't immediately forgotten by another seeing a shorter one.
 */
export const noteRateLimit = (err: unknown): RateLimitInfo => {
	const info = rateLimitOf(err)
	if (!info.limited) return info
	const until = Date.now() + (info.retryAfterMs || DEFAULT_COOLDOWN_MS)
	if (until > cooldownUntil) cooldownUntil = until
	return info
}

/** Milliseconds left on the known cooldown; 0 when we believe we're fine. */
export const gatewayCooldownMs = (): number => Math.max(0, cooldownUntil - Date.now())

/** Whole seconds left on the cooldown, for `Retry-After`-style headers. */
export const gatewayCooldownSeconds = (): number => Math.ceil(gatewayCooldownMs() / 1000)

/**
 * True while we have positive evidence the gateway is refusing us. Read this to
 * skip work that is optional (diagnostics, presence, prefetches) — never to skip
 * work a player is waiting on. A player's move is always worth attempting, even
 * into a limit: the cooldown may have lapsed since we last heard.
 */
export const gatewayThrottled = (): boolean => gatewayCooldownMs() > 0

/** Testing seam: forget everything we think we know about the limit. */
export const resetRateLimitState = (): void => {
	cooldownUntil = 0
}
