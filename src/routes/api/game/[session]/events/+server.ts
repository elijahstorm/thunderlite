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
		const members = await gameStore.members(session)
		if (members.length === 0 || !members.includes(userSession)) {
			throw error(403, 'Not a member of this game session')
		}

		const { events, lastEventId } = await gameStore.events(session, since)
		return json({ events, lastEventId })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not load game events')
	}
}
