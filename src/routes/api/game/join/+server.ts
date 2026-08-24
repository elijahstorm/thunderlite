import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore, roomCapacity } from '$lib/Game/store.server'
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

		// Seats are per-room (one per side the map fields), not a global constant.
		const capacity = roomCapacity(room)

		// Already in this room — just refresh the pointer and return the map.
		if (members.includes(userSession)) {
			await gameStore.setPlayerGame(userSession, session)
			return json({ session, mapId: room.map_id })
		}

		if (members.length >= capacity) {
			throw error(409, 'Game session is full')
		}

		// `locals.user` is the DontCode id, which is the player's public
		// `profiles(auth)` — stored on the seat so `/play` can show their username.
		await gameStore.addMember(session, userSession, locals.user ?? '')
		// Guard the seat race: if we tipped the room over capacity, roll back.
		const count = await gameStore.memberCount(session)
		if (count > capacity) {
			await gameStore.removeMember(session, userSession)
			throw error(409, 'Game session is full')
		}
		await gameStore.setPlayerGame(userSession, session)
		// A new arrival changes the lineup, so nobody's earlier ready carries over
		// — including a host who readied up and then wandered off while waiting.
		// Everyone confirms against the room they can actually see.
		await gameStore.clearReady(session)

		// A join that fills the room may arm the pre-game countdown (a live room
		// still waits for both players to ready up; an async room releases on its
		// own) and nudges every lobby (the host's especially) to show the change
		// without waiting for a poll. Both are best-effort — the lobby's own poll
		// + self-heal cover a lost push.
		if (count >= capacity) {
			const startAt = await gameStore.armStartCountdown(session)
			await realtime.tryPublish(`game:${session}`, { lobby: { count, startAt } })
		} else {
			await realtime.tryPublish(`game:${session}`, { lobby: { count, startAt: null } })
		}

		return json({ session, mapId: room.map_id })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		await logToErrorDb(msg)
		throw error(500, 'Could not join game session')
	}
}
