import { budgetPressure, gatewayThrottled, type GatewayScope } from './rateLimit'

/**
 * How fast a connected client should poll, decided by the server.
 *
 * The poll interval used to be a client constant. That made the one cadence the
 * app fully controls immune to the one signal that should move it: how much of
 * the project's shared budget is left. Every poll response now carries
 * `pollAfterMs`, and the client stretches its reconciliation pass to match.
 *
 * Three tiers, deliberately coarse. A room polls at the normal cadence while
 * the namespaces the poll spends are healthy, twice as slowly once either shows
 * low headroom, and four times as slowly while either is refusing us. The
 * socket is carrying the match either way, so the cost of slowing down is a
 * later catch of a missed frame, and the cost of not slowing down is the 429
 * that turns into a frozen board.
 *
 * `scopes` is what the poll's fast and slow paths spend: the cursor read on
 * `cache`, the fallback reads on `db/read`.
 */
export const POLL_NORMAL_MS = 30_000
export const POLL_PRESSURE_MS = 60_000
export const POLL_THROTTLED_MS = 120_000

const POLL_SCOPES: GatewayScope[] = ['cache', 'db/read']

export type PacingSignals = {
	throttled: (scope: GatewayScope) => boolean
	pressure: (scope: GatewayScope) => boolean
}

const live: PacingSignals = { throttled: gatewayThrottled, pressure: budgetPressure }

/** Pure form, for tests and for callers that already hold the readings. */
export const pollAfterMsFor = (signals: PacingSignals, scopes = POLL_SCOPES): number => {
	if (scopes.some((scope) => signals.throttled(scope))) return POLL_THROTTLED_MS
	if (scopes.some((scope) => signals.pressure(scope))) return POLL_PRESSURE_MS
	return POLL_NORMAL_MS
}

/** The pacing to hand a client right now, from the live budget readings. */
export const pollAfterMs = (): number => pollAfterMsFor(live)
