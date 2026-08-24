import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { cancelSubscription } from '$lib/Pro/subscription.server'
import { notify } from '$lib/Notifications/email.server'
import { proCanceled } from '$lib/Notifications/templates'

/**
 * Cancel at period end. The user keeps Pro until `currentPeriodEnd`, then it
 * lapses. The DontCode gateway records the pending cancellation; we send the
 * confirmation email.
 */
export const POST = async ({ locals }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'Not signed in')

	try {
		const subscription = await cancelSubscription(userAuth)
		if (!subscription) return json({ status: 'none' })

		await notify({
			userAuth,
			category: 'subscription',
			// End-date-scoped so a re-cancel of the same period stays one email.
			dedupKey: `pro-canceled:${userAuth}:${subscription.currentPeriodEnd ?? 'end'}`,
			email: locals.userEmail,
			content: proCanceled(subscription.currentPeriodEnd),
		})

		return json({ status: 'ok', subscription })
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not cancel subscription')
	}
}
