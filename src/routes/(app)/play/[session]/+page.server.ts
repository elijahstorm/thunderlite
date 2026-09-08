import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { loadMatch } from '$lib/Game/loadMatch.server'

/**
 * One match, addressed by its room code. This is the canonical way into a
 * board: correspondence players have several games in flight at once, so the
 * URL — not a single server-side "current game" pointer — decides which one
 * they are looking at. Email links and the games hub both come straight here.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	try {
		return await loadMatch(userSession, locals.user ?? '', params.session)
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		await logToErrorDb(msg)
		throw error(500, 'Could not load game session')
	}
}
