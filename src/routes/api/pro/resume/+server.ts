import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { resumeSubscription, toView } from '$lib/Pro/subscription.server'

/** Undo a pending cancellation — flip a canceling subscription back to active. */
export const POST = async ({ locals }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'Not signed in')

	try {
		const sub = await resumeSubscription(userAuth)
		if (!sub) return json({ status: 'none' })
		return json({ status: 'ok', subscription: toView(sub) })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not resume subscription')
	}
}
