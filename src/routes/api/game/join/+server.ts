import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore, MAX_PLAYERS } from '$lib/Game/store.server'
import { realtime } from '$lib/dontcode/server'

export const POST = async ({ request, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const { session } = await request.json()
	if (!session || typeof session !== 'string') {
		throw error(400, 'Please provide a session code')
	}

	try {
		const [room, members] = await Promise.all([
			gameStore.getRoom(session),
			gameStore.members(session),
		])
		if (!room || members.length === 0) {
			throw error(404, 'Game session does not exist')
		}
		if (!room.map_id) throw error(500, 'Game session is missing map data')

		// Already in this room — just refresh the pointer and return the map.
		if (members.includes(userSession)) {
			await gameStore.setPlayerGame(userSession, session)
			return json({ session, mapId: room.map_id })
		}

		if (members.length >= MAX_PLAYERS) {
			throw error(409, 'Game session is full')
		}

		await gameStore.addMember(session, userSession)
		// Guard the seat race: if we tipped the room over capacity, roll back.
		const count = await gameStore.memberCount(session)
		if (count > MAX_PLAYERS) {
			await gameStore.removeMember(session, userSession)
			throw error(409, 'Game session is full')
		}
		await gameStore.setPlayerGame(userSession, session)

		// A join that fills the room arms the pre-game countdown and nudges every
		// lobby (the host's especially) to show it without waiting for a poll. Both
		// are best-effort — the lobby's own poll + self-heal cover a lost push.
		if (count >= MAX_PLAYERS) {
			const startAt = await gameStore.armStartCountdown(session)
			await realtime.tryPublish(`game:${session}`, { lobby: { count, startAt } })
		} else {
			await realtime.tryPublish(`game:${session}`, { lobby: { count, startAt: null } })
		}

		return json({ session, mapId: room.map_id })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not join game session')
	}
}
