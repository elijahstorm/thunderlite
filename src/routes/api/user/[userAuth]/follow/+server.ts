import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { db } from '$lib/dontcode/server'

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
		logToErrorDb(msg)
		throw error(500, 'Invalid target auth string')
	}

	return json({ status })
}
