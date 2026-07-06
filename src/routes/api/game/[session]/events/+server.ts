import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore } from '$lib/Game/store.server'

export const GET = async ({ url, params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	if (!session) throw error(400, 'Missing session')

	const sinceRaw = url.searchParams.get('since')
	const since = sinceRaw === null ? -1 : parseInt(sinceRaw, 10)
	if (!Number.isFinite(since)) throw error(400, 'Invalid since parameter')

	try {
		// The membership gate and the event read hit different tables and don't
		// depend on each other, so fetch both in one barrier — this is the hot
		// poll path. The events are discarded (never returned) if the 403 fires.
		const [members, page] = await Promise.all([
			gameStore.members(session),
			gameStore.events(session, since),
		])
		if (members.length === 0 || !members.includes(userSession)) {
			throw error(403, 'Not a member of this game session')
		}

		return json({ events: page.events, lastEventId: page.lastEventId })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not load game events')
	}
}
