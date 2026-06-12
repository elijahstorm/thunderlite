import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { db } from '$lib/Server/dontcode'

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

	return json({ status })
}
