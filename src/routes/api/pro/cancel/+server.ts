import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { cancelSubscription, toView } from '$lib/Pro/subscription.server'

/**
 * Cancel at period end. The user keeps Pro until `current_period_end`, then it
 * lapses — the standard subscription-cancel behavior, so the flow can be tested
 * without immediately revoking access.
 */
export const POST = async ({ locals }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'Not signed in')

	try {
		const sub = await cancelSubscription(userAuth)
		if (!sub) return json({ status: 'none' })
		return json({ status: 'ok', subscription: toView(sub) })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not cancel subscription')
	}
}
