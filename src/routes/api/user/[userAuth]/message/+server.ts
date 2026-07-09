import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { db, realtime } from '$lib/dontcode/server'
import { notify, profileName, rememberEmail } from '$lib/Notifications/email.server'
import { newMessage } from '$lib/Notifications/templates'

export const POST = async ({ params, request, locals }) => {
	const message = (await request.formData()).get('chat-input')?.toString()
	if (!message) return json({ status: 'no message' })
	const { userAuth } = params
	const source = locals.user
	const target = userAuth
	if (!source) return json({ status: 'not logged in' })
	if (source === target) return json({ status: 'same' })
	let status = 'unknown'

	try {
		await db.insert('messages', { source, target, message })
		status = 'ok'
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Invalid target auth or message string')
	}

	// Live delivery: push to the recipient's private mailbox. The browser never
	// holds publish rights — the server publishes on its behalf. Best-effort, so
	// if realtime is down the message still landed in the DB above and shows on
	// the recipient's next load/poll.
	await realtime.tryPublish(`dm:${target}`, {
		source,
		target,
		message,
		created_at: new Date().toISOString(),
	})

	// Email the recipient, at most once per sender per hour so an active chat
	// does not turn into a flood of emails. The realtime push above is the
	// primary channel; this catches recipients who are away.
	const hourBucket = new Date().toISOString().slice(0, 13)
	const preview = message.length > 140 ? `${message.slice(0, 140)}…` : message
	await rememberEmail(source, locals.userEmail)
	await notify({
		userAuth: target,
		category: 'social',
		dedupKey: `dm:${source}:${target}:${hourBucket}`,
		content: newMessage(await profileName(source), preview),
	})

	return json({ status })
}
