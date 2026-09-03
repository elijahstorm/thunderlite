import { error, json } from '@sveltejs/kit'
import { dev } from '$app/environment'
import {
	cleanupStressRun,
	startStressRun,
	stopStressRun,
	stressSnapshot,
	type StressOptions,
} from '$lib/Dev/serverStress/simulator.server'

/**
 * Controls for the server stress test (`/dev/server-stress-test`).
 *
 * The run lives in this process: virtual players call the real game routes on
 * this same origin, so every gateway call they cause is the one a real client
 * would have caused, attributed by the ledger to the route that made it. The
 * gateway on the other end is whatever `DONTCODE_API_URL` names, which is the
 * whole point: pointed at production, this measures the production budget.
 *
 *   GET            the live snapshot: rooms, requests by route, budgets
 *   POST start     `{ action: 'start', options }`
 *   POST stop      `{ action: 'stop' }` — rooms wind down, rows stay for cleanup
 *   POST cleanup   `{ action: 'cleanup' }` — delete every row this run created
 *
 * Dev only. Not a diagnostics-token surface like `/api/diagnostics/gateway`: a
 * page that can spend a production budget on demand has no business existing in
 * a deployed build at all.
 */
const guard = () => {
	if (!dev) throw error(404, 'Not found')
}

export const GET = async () => {
	guard()
	return json(stressSnapshot())
}

export const POST = async ({ request, url }) => {
	guard()
	let body: { action?: string; options?: Partial<StressOptions> }
	try {
		body = await request.json()
	} catch {
		throw error(400, 'Invalid JSON body')
	}
	switch (body.action) {
		case 'start':
			return json(startStressRun(body.options ?? {}, url.origin))
		case 'stop':
			stopStressRun()
			return json(stressSnapshot())
		case 'cleanup':
			return json(await cleanupStressRun())
		default:
			throw error(400, 'Unknown action')
	}
}
