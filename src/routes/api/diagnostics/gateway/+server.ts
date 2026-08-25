import { error, json } from '@sveltejs/kit'
import { dev } from '$app/environment'
import { env } from '$env/dynamic/private'
import { ledgerWindow } from '$lib/Security/gatewayLedger'
import {
	budgetSnapshot,
	GATEWAY_BUDGET_PER_MINUTE,
	type GatewayScope,
} from '$lib/Security/rateLimit'

/**
 * What this instance is spending at the gateway, right now.
 *
 * The question this answers is not "is the platform slow" but "what are we
 * spending the budget on", and they have different fixes. The gateway budgets
 * each namespace per project per minute — the database as two, `db/read` at 900
 * and `db/write` at 300 — and the sync path is built out of many small calls, so
 * a room can stall with every individual call returning promptly. When it does, the reason is visible here and nowhere else:
 * the poll's share, the heartbeat's share, and what is left for the moves a
 * player is actually waiting on.
 *
 * Scoped to the instance that serves the request. On Fluid Compute a warm
 * instance accumulates a real window, so repeated reads of a busy deployment
 * sample different instances — treat a single read as one instance's view, not
 * the project's total. `seconds` says how much history the reader is looking at.
 *
 * Access: open in dev. In production it needs `DIAGNOSTICS_TOKEN` to be set and
 * matched, via the `x-diagnostics-token` header or a `token` query parameter.
 * Unset means unreachable in production rather than open — an operational view
 * of a deployment is not something to leave on by default.
 */
export const GET = async ({ request, url }) => {
	if (!dev) {
		const expected = env.DIAGNOSTICS_TOKEN
		const offered = request.headers.get('x-diagnostics-token') ?? url.searchParams.get('token')
		if (!expected || offered !== expected) throw error(404, 'Not found')
	}

	const window = ledgerWindow()
	const budgets = budgetSnapshot()

	// What each namespace's measured rate represents as a share of its allowance.
	// The gateway's own reported limit wins where we have one; the documented
	// figure fills in for a namespace nothing has called yet on this instance.
	const scopes = Object.entries(window.perMinuteByScope).map(([scope, perMinute]) => {
		const reported = budgets[scope]?.limit
		const budget = reported ?? GATEWAY_BUDGET_PER_MINUTE[scope as GatewayScope]
		return {
			scope,
			perMinute,
			budget: budget ?? null,
			share: budget ? Number((perMinute / budget).toFixed(3)) : null,
			remaining: budgets[scope]?.remaining ?? null,
			cooldownSeconds: budgets[scope]?.cooldownSeconds ?? 0,
		}
	})

	return json({
		window: {
			seconds: window.seconds,
			calls: window.calls,
			callsPerMinute: window.callsPerMinute,
			failures: window.failures,
			// Mean wall-clock per call. Low here with a high `share` is the signature
			// worth knowing: the gateway is fine and we are simply calling it too
			// many times, which no amount of latency work would fix.
			meanMs: window.calls > 0 ? Math.round(window.ms / window.calls) : 0,
		},
		scopes: scopes.sort((a, b) => (b.share ?? 0) - (a.share ?? 0)),
		// Calls attributed to the route that made them, which is what turns "the db
		// budget is gone" into "and the poll took two thirds of it".
		routes: Object.entries(window.byRoute)
			.map(([route, calls]) => ({ route, calls }))
			.slice(0, 25),
	})
}
