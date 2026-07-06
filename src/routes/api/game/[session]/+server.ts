import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore, MAX_PLAYERS } from '$lib/Game/store.server'

/**
 * Lobby state for a room member — polled by the pre-game lobby (and a realtime
 * push accelerates it). Deliberately returns only counts and the caller's own
 * seat: `user_session` values are server-derived auth identities and must never
 * reach another player's browser. Arming the countdown here too (when the room
 * is already full but never got armed) makes the handoff self-heal if the
 * join-time arm was lost.
 */
export const GET = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	if (!session) throw error(400, 'Missing session')

	try {
		const room = await gameStore.getRoom(session)
		if (!room) throw error(404, 'Game session does not exist')

		const seat = await gameStore.seatOf(session, userSession)
		if (seat < 0) throw error(403, 'Not a member of this game session')

		const count = await gameStore.memberCount(session)
		const full = count >= MAX_PLAYERS

		// Self-heal: a full room that never got its countdown armed (lost arm at
		// join time) starts ticking now instead of stalling in the lobby forever.
		let startAt = room.start_at
		if (full && startAt == null) {
			startAt = await gameStore.armStartCountdown(session)
		}

		return json({
			session,
			mapId: room.map_id,
			seat,
			isHost: seat === 0,
			count,
			maxPlayers: MAX_PLAYERS,
			full,
			startAt: startAt ?? null,
		})
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not load game session')
	}
}
