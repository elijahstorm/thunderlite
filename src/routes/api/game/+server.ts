import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { isValidMapId } from '$lib/Map/hashLoader.js'
import { gameStore } from '$lib/Game/store.server'

export const POST = async ({ request, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const { mapId } = await request.json()
	if (!mapId) throw error(400, 'Please provide a map id')
	if (!(await isValidMapId(mapId))) throw error(400, 'Map with that id does not exist')

	try {
		const session = await gameStore.createRoom(userSession, mapId)
		return json({ session })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not create game session')
	}
}
