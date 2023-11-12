import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

export const GET = async ({ params, locals, request }) => {
	const { message } = await request.json()
	const { userAuth } = params
	const source = locals.user
	const target = userAuth
	if (!source) return json({ status: 'not logged in' })
	if (source === target) return json({ status: 'same' })
	let status = 'unknown'

	try {
		await locals.sql`insert into message ${locals.sql(
			{ source, target, message },
			'source',
			'target',
			'message'
		)}`
		status = 'ok'
	} catch (msg) {
		logToErrorDb(locals.sql)(msg)
		throw error(500, 'Invalid target auth or message string')
	}

	return json({ status })
}
