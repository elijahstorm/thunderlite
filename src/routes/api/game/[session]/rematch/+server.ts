import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore } from '$lib/Game/store.server'

/**
 * Rematch a finished online match into a FRESH lobby. The first player to ask
 * creates the new room (and hosts it); everyone else who hits rematch joins that
 * same room. Same map, new lobby — so the old opponents aren't required to come
 * back (see the rematch flow in GameStateManager). Returns the new session code.
 */
export const POST = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const session = params.session
	if (!session) throw error(400, 'Missing session')

	try {
		const next = await gameStore.rematchRoom(session, userSession, locals.user ?? '')
		if (!next) throw error(404, 'Original game session is gone')
		return json({ session: next })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		await logToErrorDb(msg)
		throw error(500, 'Could not set up a rematch')
	}
}
