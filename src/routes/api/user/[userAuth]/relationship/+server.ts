import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { db } from '$lib/dontcode/server'

export const GET = async ({ params, locals }) => {
	const { userAuth } = params
	const source = locals.user
	const target = userAuth
	if (!source) return json({ status: 'not logged in' })
	if (source === target) return json({ status: 'same' })
	let status = 'unknown'

	try {
		const relationship = await db.findOne<{ status: string }>('relationships', {
			where: { source, target },
			select: ['status'],
		})

		if (relationship) {
			status = relationship.status
		}
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not access database')
	}

	return json({ status })
}
