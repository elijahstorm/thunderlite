import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore, MAX_PLAYERS } from '$lib/Game/store.server'

export const POST = async ({ request, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const { session } = await request.json()
	if (!session || typeof session !== 'string') {
		throw error(400, 'Please provide a session code')
	}

	try {
		const room = await gameStore.getRoom(session)
		const members = await gameStore.members(session)
		if (!room || members.length === 0) {
			throw error(404, 'Game session does not exist')
		}
		if (!room.sha) throw error(500, 'Game session is missing map data')

		// Already in this room — just refresh the pointer and return the map.
		if (members.includes(userSession)) {
			await gameStore.setPlayerGame(userSession, session)
			return json({ session, sha: room.sha })
		}

		if (members.length >= MAX_PLAYERS) {
			throw error(409, 'Game session is full')
		}

		await gameStore.addMember(session, userSession)
		// Guard the seat race: if we tipped the room over capacity, roll back.
		if ((await gameStore.memberCount(session)) > MAX_PLAYERS) {
			await gameStore.removeMember(session, userSession)
			throw error(409, 'Game session is full')
		}
		await gameStore.setPlayerGame(userSession, session)

		return json({ session, sha: room.sha })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not join game session')
	}
}
