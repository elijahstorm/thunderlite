import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore } from '$lib/Game/store.server'
import { notifyAsyncTimeout } from '$lib/Game/asyncNotify.server'
import { clampAsyncTimeout } from '$lib/Game/asyncConfig'

export const GET = async ({ url, params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	if (!session) throw error(400, 'Missing session')

	const sinceRaw = url.searchParams.get('since')
	const since = sinceRaw === null ? -1 : parseInt(sinceRaw, 10)
	if (!Number.isFinite(since)) throw error(400, 'Invalid since parameter')

	try {
		// The membership gate, the event read, and the room row hit different
		// tables and don't depend on each other, so fetch them in one barrier —
		// this is the hot poll path. The events are discarded (never returned)
		// if the 403 fires.
		const [members, page, room] = await Promise.all([
			gameStore.members(session),
			gameStore.events(session, since),
			gameStore.getRoom(session),
		])
		if (members.length === 0 || !members.includes(userSession)) {
			throw error(403, 'Not a member of this game session')
		}

		// Async rooms enforce the turn clock lazily on the poll too, so a viewer
		// with the game open sees the timeout resolve without waiting for the
		// hourly cron. The resulting surrender lands in the log; re-read the page
		// so THIS response already carries it.
		let events = page.events
		let lastEventId = page.lastEventId
		let turnDeadline: number | null = null
		if (room?.mode === 'async') {
			const enforced = await gameStore.enforceTurnDeadline(session, room)
			if (enforced) {
				await notifyAsyncTimeout(session, enforced, clampAsyncTimeout(room.turn_timeout_ms))
				const refreshed = await gameStore.events(session, since)
				events = refreshed.events
				lastEventId = refreshed.lastEventId
				turnDeadline = enforced.turnDeadline
			} else {
				turnDeadline = room.turn_deadline == null ? null : Number(room.turn_deadline)
			}
		}

		return json({ events, lastEventId, turnDeadline })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not load game events')
	}
}
