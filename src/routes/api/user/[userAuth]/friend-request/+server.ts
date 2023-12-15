import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { setRelationship } from '$lib/Database/Relationships/relationships.js'

export const POST = async ({ params, locals }) => {
	try {
		return json(
			await new Promise<{ status: string }>((resolve) =>
				setRelationship(
					{
						source: locals.user,
						target: params.userAuth,
						status: 'friend-request',
					},
					locals.sql,
					resolve
				)
			)
		)
	} catch (msg) {
		logToErrorDb(locals.sql)(msg)
		error(500, 'Invalid target auth string');
	}
}
