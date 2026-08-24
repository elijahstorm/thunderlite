import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { setRelationship } from '$lib/Database/Relationships/relationships.js'

export const POST = async ({ params, locals }) => {
	try {
		return json(
			await setRelationship({
				source: locals.user,
				target: params.userAuth,
				status: 'blocked',
			})
		)
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not access database')
	}
}
