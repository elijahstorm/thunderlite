import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { isValidMapHash } from '$lib/Map/hashLoader.js'
import { gameStore } from '$lib/Game/store.server'

export const POST = async ({ request, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const { sha } = await request.json()
	if (!sha) throw error(400, 'Please provide a map SHA')
	if (!(await isValidMapHash(sha))) throw error(400, 'Map with that SHA does not exist')

	try {
		const session = await gameStore.createRoom(userSession, sha)
		return json({ session })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not create game session')
	}
}
