/**
 * Gateway budget awareness (server-only).
 *
 * The DontCode v1 gateway budgets each namespace separately, per project
 * (`dontcode-backend` commit `6952df6c`). Per-minute allowances as of that
 * change: realtime 1200 · cache 1000 · db 600 · auth 300 · payments 120 ·
 * storage 120 · info 120 · notifications 60 · db/migrate 10.
 *
 * Two consequences shape this module.
 *
 * 1. Budgets are per namespace, so cooldowns are tracked per namespace. One
 *    global flag would read a `notifications` limit — 60/min, the tightest
 *    thing this app touches regularly — as proof the database is unavailable,
 *    and switch off diagnostics and presence over a budget they never spend.
 *    Suppressing the wrong feature is its own outage.
 *
 * 2. The gateway reports `RateLimit-Limit/-Remaining/-Reset` on every counted
 *    response, successes included, and `dontcode@0.2.9` surfaces that through
 *    an `onRateLimit` callback (wired in dontcode/server.ts). So the app does
 *    not have to wait to be refused before reacting. `budgetPressure` turns the
 *    remaining count into a decision that optional work can act on while calls
 *    are still succeeding — which is the difference between shedding diagnostic
 *    traffic and shedding a player's move.
 *
 * State is module-scoped, which on Fluid Compute survives across invocations on
 * a warm instance. That makes this a genuine breaker for the busy instance
 * rather than a per-request curiosity. A cold instance starts unaware and
 * learns from its first response, which is the right failure mode: neither
 * pessimism nor optimism outlives the instance that earned it.
 */
import type { RateLimitStatus } from 'dontcode'
import { isDontCodeError } from 'dontcode'

/**
 * The gateway's metered namespaces. Spelled as the SDK derives them from the
 * request path (`db/migrate`, with a slash) — the 429 body's `scope` field uses
 * the gateway's internal spelling (`db_migrate`) for that one, so both are
 * normalised on the way in.
 */
export type GatewayScope =
	| 'auth'
	| 'cache'
	| 'db'
	| 'db/migrate'
	| 'info'
	| 'notifications'
	| 'payments'
	| 'realtime'
	| 'storage'

const SCOPES = new Set<string>([
	'auth',
	'cache',
	'db',
	'db/migrate',
	'info',
	'notifications',
	'payments',
	'realtime',
	'storage',
])

/** Accept either spelling of a namespace, and reject anything unrecognised. */
const asScope = (raw: unknown): GatewayScope | null => {
	if (typeof raw !== 'string') return null
	const normalized = raw === 'db_migrate' ? 'db/migrate' : raw
	return SCOPES.has(normalized) ? (normalized as GatewayScope) : null
}

/**
 * Scopes whose loss a player can perceive. A `notifications` or `payments`
 * cooldown is real and worth backing off from, but telling someone mid-match
 * that the servers are busy because an email queue is full would be alarming
 * and untrue.
 */
const PLAYER_FACING: GatewayScope[] = ['db', 'realtime', 'auth', 'storage']

/** Sanity fence on a reported cooldown, so one bad number can't park us. */
const MAX_COOLDOWN_SECONDS = 120
/** Assumed cooldown when we're refused but told nothing about for how long. */
const DEFAULT_COOLDOWN_MS = 15_000

type Budget = {
	/** Epoch ms the namespace should be usable again; 0 when not refused. */
	cooldownUntil: number
	/** Last reported headroom, and when — a window is a minute, so it goes stale. */
	remaining?: number
	limit?: number
	seenAt: number
}

const budgets = new Map<GatewayScope, Budget>()
/** Cooldown for a refusal we could not attribute to any one namespace. */
let unattributedUntil = 0

const budgetOf = (scope: GatewayScope): Budget =>
	budgets.get(scope) ?? { cooldownUntil: 0, seenAt: 0 }

/**
 * Record what the SDK observed on a counted response. Called for every request
 * the app makes, successes included, via the client's `onRateLimit` hook.
 */
export const noteRateLimitStatus = (status: RateLimitStatus): void => {
	const scope = asScope(status.namespace)
	if (!scope) {
		if (status.exceeded) {
			const wait = (status.retryAfter ?? 0) || DEFAULT_COOLDOWN_MS / 1000
			unattributedUntil = Math.max(unattributedUntil, Date.now() + wait * 1000)
		}
		return
	}

	const prior = budgetOf(scope)
	const next: Budget = {
		cooldownUntil: prior.cooldownUntil,
		remaining: status.remaining ?? prior.remaining,
		limit: status.limit ?? prior.limit,
		seenAt: Date.now(),
	}
	if (status.exceeded) {
		const seconds = Math.min(status.retryAfter ?? 0, MAX_COOLDOWN_SECONDS)
		const until = Date.now() + (seconds > 0 ? seconds * 1000 : DEFAULT_COOLDOWN_MS)
		// The longest known cooldown wins, so one call site learning about a
		// 56-second wait isn't forgotten by another seeing a shorter one.
		next.cooldownUntil = Math.max(next.cooldownUntil, until)
		next.remaining = 0
	}
	budgets.set(scope, next)
}

/** What a caught error says about the budget, if anything. */
export type RateLimitInfo = {
	limited: boolean
	/** How long the responder said to wait, in ms. 0 when it didn't say. */
	retryAfterMs: number
	/** Which budget was refused, when we can tell. */
	scope: GatewayScope | null
}

const NOT_LIMITED: RateLimitInfo = { limited: false, retryAfterMs: 0, scope: null }

/**
 * Read a caught error as a rate-limit verdict.
 *
 * `spending` names the namespace the caller was drawing on, for refusals that
 * identify no budget themselves. That isn't only a legacy case: auth, payments
 * and notifications each sit behind a tighter downstream limiter that answers
 * in its own envelope with no `scope` and no `RateLimit-*` headers.
 */
export const rateLimitOf = (err: unknown, spending?: GatewayScope): RateLimitInfo => {
	if (!isDontCodeError(err) || !err.rateLimited) return NOT_LIMITED
	const seconds = Math.min(Math.max(err.retryAfter ?? 0, 0), MAX_COOLDOWN_SECONDS)
	return {
		limited: true,
		retryAfterMs: seconds * 1000,
		scope: asScope(err.scope) ?? spending ?? null,
	}
}

/**
 * Record that we were refused, and on which budget.
 *
 * The SDK's hook already sees every response, so this is usually confirming
 * what the tracker knows. It stays because the hook cannot attribute a refusal
 * that names no namespace and carries no headers, and the caller can.
 */
export const noteRateLimit = (err: unknown, spending?: GatewayScope): RateLimitInfo => {
	const info = rateLimitOf(err, spending)
	if (!info.limited) return info
	const until = Date.now() + (info.retryAfterMs || DEFAULT_COOLDOWN_MS)
	if (!info.scope) {
		// Unattributable: held separately rather than smeared across every
		// namespace, so one mystery refusal can't mute the whole app.
		unattributedUntil = Math.max(unattributedUntil, until)
		return info
	}
	const prior = budgetOf(info.scope)
	budgets.set(info.scope, {
		...prior,
		cooldownUntil: Math.max(prior.cooldownUntil, until),
		remaining: 0,
		seenAt: Date.now(),
	})
	return info
}

/** Milliseconds left on a namespace's cooldown; 0 when we believe it's fine. */
export const gatewayCooldownMs = (scope: GatewayScope): number =>
	Math.max(0, budgetOf(scope).cooldownUntil - Date.now())

/** Whole seconds left on a cooldown, for `Retry-After`-style headers. */
export const gatewayCooldownSeconds = (scope: GatewayScope): number =>
	Math.ceil(gatewayCooldownMs(scope) / 1000)

/** True while we have positive evidence this budget is refusing us. */
export const gatewayThrottled = (scope: GatewayScope): boolean => gatewayCooldownMs(scope) > 0

/**
 * A reading of the last `RateLimit-Remaining` goes stale within one window, so
 * anything older than this is treated as no information rather than good news.
 */
const HEADROOM_TTL_MS = 60_000
/** Below this share of the budget, optional work should start standing down. */
const LOW_HEADROOM = 0.2

/**
 * How much of a namespace's budget is left, as a share between 0 and 1, or
 * `null` when nothing recent is known. Exposed for logging and for callers that
 * want a threshold of their own.
 */
export const budgetHeadroom = (scope: GatewayScope): number | null => {
	const budget = budgetOf(scope)
	if (budget.remaining === undefined || !budget.limit) return null
	if (Date.now() - budget.seenAt > HEADROOM_TTL_MS) return null
	return Math.max(0, Math.min(1, budget.remaining / budget.limit))
}

/**
 * Should optional work stand aside to leave this budget for something that
 * matters? True once we're refused, and also once headroom runs low while calls
 * are still succeeding — which is the point of the success-path headers.
 *
 * Read this for diagnostics, presence polls, prefetches, unattended sweeps.
 * Never for work a player is waiting on: a move is always worth attempting,
 * because being wrong here costs a frozen board and being right saves a log
 * line. The asymmetry is the whole design.
 */
export const budgetPressure = (scope: GatewayScope): boolean => {
	if (gatewayThrottled(scope)) return true
	const headroom = budgetHeadroom(scope)
	return headroom !== null && headroom < LOW_HEADROOM
}

/**
 * The longest cooldown a player could plausibly notice, in whole seconds — what
 * the app tells the browser so it can show an honest countdown. Unattributed
 * refusals count: not knowing which budget we hit is no reason to assume it was
 * a harmless one.
 *
 * Deliberately reports only actual refusals, never headroom pressure. Standing
 * work down early is an internal economy; a banner is a promise that something
 * is actually unavailable.
 */
export const playerFacingCooldownSeconds = (): number => {
	const longest = PLAYER_FACING.reduce(
		(worst, scope) => Math.max(worst, gatewayCooldownMs(scope)),
		Math.max(0, unattributedUntil - Date.now())
	)
	return Math.ceil(longest / 1000)
}

/** Snapshot for diagnostics: what every namespace last reported. */
export const budgetSnapshot = (): Record<
	string,
	{ remaining?: number; limit?: number; cooldownSeconds: number }
> =>
	Object.fromEntries(
		[...budgets.entries()].map(([scope, budget]) => [
			scope,
			{
				remaining: budget.remaining,
				limit: budget.limit,
				cooldownSeconds: Math.ceil(Math.max(0, budget.cooldownUntil - Date.now()) / 1000),
			},
		])
	)

/** Testing seam: forget everything we think we know about the budgets. */
export const resetRateLimitState = (): void => {
	budgets.clear()
	unattributedUntil = 0
}
