import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore } from '$lib/Game/store.server'

/**
 * Leave a room: drop this player's membership and their "current room" pointer,
 * freeing them to create or join a new game. Used to get out of a finished or
 * abandoned match that otherwise lingers as the player's active session until
 * the room's 24h TTL expires.
 */
export const POST = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const session = params.session
	if (!session) throw error(400, 'Missing session')

	try {
		await gameStore.leaveGame(session, userSession)
		return json({ ok: true })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not leave the game')
	}
}
