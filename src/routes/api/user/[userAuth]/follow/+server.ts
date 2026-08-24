import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { db } from '$lib/dontcode/server'
import { notify, profileName, rememberEmail } from '$lib/Notifications/email.server'
import { newFollower } from '$lib/Notifications/templates'

export const POST = async ({ params, locals }) => {
	const { userAuth } = params
	const source = locals.user
	const target = userAuth
	if (!source) return json({ status: 'not logged in' })
	if (source === target) return json({ status: 'same' })
	let status = 'unknown'

	try {
		await db.insert('follows', { source, target })
		status = 'ok'
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Invalid target auth string')
	}

	// Notify the followed user. Best-effort, deduped so a re-follow stays quiet.
	await rememberEmail(source, locals.userEmail)
	await notify({
		userAuth: target,
		category: 'social',
		dedupKey: `follow:${source}:${target}`,
		content: newFollower(await profileName(source)),
	})

	return json({ status })
}
