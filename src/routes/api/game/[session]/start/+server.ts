import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore, MAX_PLAYERS } from '$lib/Game/store.server'
import { realtime } from '$lib/dontcode/server'

/**
 * Host skip — pull the lobby countdown forward to now so `/play` opens
 * immediately. Only the host (seat 0) may skip, and only once the room is full
 * (there is no one-player match). The realtime push lets the guest's lobby jump
 * without waiting for its next poll; the persisted `start_at` is the source of
 * truth a refresh or a lost push falls back to.
 */
export const POST = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	if (!session) throw error(400, 'Missing session')

	try {
		const room = await gameStore.getRoom(session)
		if (!room) throw error(404, 'Game session does not exist')

		const seat = await gameStore.seatOf(session, userSession)
		if (seat < 0) throw error(403, 'Not a member of this game session')
		if (seat !== 0) throw error(403, 'Only the host can start the match')

		const count = await gameStore.memberCount(session)
		if (count < MAX_PLAYERS) throw error(409, 'Waiting for another player to join')

		const startAt = await gameStore.startNow(session)
		await realtime.tryPublish(`game:${session}`, { lobby: { count, startAt } })

		return json({ startAt })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not start the match')
	}
}
