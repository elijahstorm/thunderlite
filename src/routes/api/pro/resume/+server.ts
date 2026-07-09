import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { resumeSubscription } from '$lib/Pro/subscription.server'
import { notify } from '$lib/Notifications/email.server'
import { proResumed } from '$lib/Notifications/templates'

/** Undo a pending cancellation — flip a canceling subscription back to active. */
export const POST = async ({ locals }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'Not signed in')

	try {
		const subscription = await resumeSubscription(userAuth)
		if (!subscription) return json({ status: 'none' })

		await notify({
			userAuth,
			category: 'subscription',
			dedupKey: `pro-resumed:${userAuth}:${subscription.currentPeriodEnd ?? 'end'}`,
			email: locals.userEmail,
			content: proResumed(subscription.currentPeriodEnd),
		})

		return json({ status: 'ok', subscription })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not resume subscription')
	}
}
