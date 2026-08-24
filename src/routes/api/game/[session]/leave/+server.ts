import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore } from '$lib/Game/store.server'
import { notifyAsyncResignation } from '$lib/Game/asyncNotify.server'

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
		// Walking out of a STARTED async game is a resignation, recorded before
		// the seat is dropped: enforcement needs the member's team to exist, and
		// the offline opponent needs the game to resolve (and to hear about it).
		const resigned = await gameStore.resignAsyncMember(session, userSession)
		if (resigned?.gameOver && resigned.next) {
			await notifyAsyncResignation({
				session,
				eventId: resigned.eventId,
				resignedUserAuth: resigned.userAuth,
				opponentUserAuth: resigned.next.userAuth,
			})
		}
		await gameStore.leaveGame(session, userSession)
		return json({ ok: true })
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not leave the game')
	}
}
