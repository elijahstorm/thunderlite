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
		// `locals.user` is the DontCode id, which is the player's public
		// `profiles(auth)` — stored on the seat so `/play` can show their username.
		const session = await gameStore.createRoom(userSession, mapId, locals.user ?? '')
		return json({ session })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not create game session')
	}
}
