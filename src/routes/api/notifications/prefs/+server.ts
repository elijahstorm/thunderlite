import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { readJsonBody } from '$lib/dontcode/cookies'
import { getPrefs, setPrefs, type NotificationPrefs } from '$lib/Notifications/email.server'

const asBool = (value: unknown, fallback: boolean): boolean =>
	typeof value === 'boolean' ? value : fallback

/** Read the signed-in user's email notification preferences. */
export const GET = async ({ locals }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'Not signed in')
	return json({ prefs: await getPrefs(userAuth) })
}

/** Update the signed-in user's email notification preferences. */
export const POST = async ({ locals, request }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'Not signed in')

	try {
		const current = await getPrefs(userAuth)
		const body = await readJsonBody(request)
		const prefs: NotificationPrefs = {
			email_enabled: asBool(body.email_enabled, current.email_enabled),
			subscription: asBool(body.subscription, current.subscription),
			social: asBool(body.social, current.social),
			game: asBool(body.game, current.game),
		}
		await setPrefs(userAuth, prefs)
		return json({ status: 'ok', prefs })
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not save preferences')
	}
}
