import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { setRelationship } from '$lib/Database/Relationships/relationships.js'
import { notify, profileName, rememberEmail } from '$lib/Notifications/email.server'
import { friendRequest } from '$lib/Notifications/templates'

export const POST = async ({ params, locals }) => {
	const source = locals.user
	const target = params.userAuth
	try {
		const result = await new Promise<{ status: string }>((resolve) =>
			setRelationship({ source, target, status: 'friend-request' }, resolve)
		)

		// 'ok' is a genuinely new pending request; 'friends' means it auto-accepted
		// a mutual request (they had already asked), so there's no new request to
		// announce in that case.
		if (source && result.status === 'ok') {
			await rememberEmail(source, locals.userEmail)
			await notify({
				userAuth: target,
				category: 'social',
				dedupKey: `friend-request:${source}:${target}`,
				content: friendRequest(await profileName(source)),
			})
		}

		return json(result)
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Invalid target auth string')
	}
}
