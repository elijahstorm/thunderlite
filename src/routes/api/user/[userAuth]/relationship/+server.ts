import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

export const GET = async ({ params, locals }) => {
	const { userAuth } = params
	const source = locals.user
	const target = userAuth
	if (!source) return json({ status: 'not logged in' })
	if (source === target) return json({ status: 'same' })
	let status = 'unknown'

	try {
		const relationship = await locals.sql`
			select status from relationships
			where source = ${source} and target = ${target}`

		if (Array.isArray(relationship) && relationship.length) {
			status = relationship[0].status
		}
	} catch (msg) {
		logToErrorDb(locals.sql)(msg)
		error(500, 'Could not access database');
	}

	return json({ status })
}
