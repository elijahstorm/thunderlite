import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { readJsonBody } from '$lib/dontcode/cookies'
import { isPlanId } from '$lib/Pro/plans'
import { activateSubscription, toView } from '$lib/Pro/subscription.server'

/**
 * Start (or restart) a ThunderLite Pro subscription. Test mode: no card data is
 * accepted or stored here — the simulated checkout runs entirely in the browser
 * and this endpoint only records the chosen plan against the account.
 */
export const POST = async ({ locals, request }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'Not signed in')

	const body = await readJsonBody(request)
	const plan = body.plan
	if (!isPlanId(plan)) throw error(400, 'Unknown plan')

	try {
		const sub = await activateSubscription(userAuth, plan)
		return json({ status: 'ok', subscription: toView(sub) })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not start subscription')
	}
}
