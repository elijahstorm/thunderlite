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
		const [seats, page, room, clientSeq] = await Promise.all([
			gameStore.roster(session),
			gameStore.events(session, since),
			gameStore.getRoom(session),
			// Where this caller's own request stream resumes. Sent on every poll so a
			// client that reloads mid-match seeds its relay counter from the server
			// instead of restarting at 0 and having its first action refused.
			gameStore.nextClientSeq(session, userSession),
		])
		if (seats.length === 0 || !seats.some((m) => m.userSession === userSession)) {
			throw error(403, 'Not a member of this game session')
		}

		// Who is playing the CPU sides, re-answered on every poll rather than only
		// at page load. The driver is the lowest-seat human (see gameStore.aiDriver)
		// and the absence sweep can REMOVE that human mid-match — on a board with
		// CPU sides that would leave the AI with nobody to run it, and the match
		// would sit on the CPU's turn forever. Derived from the roster we already
		// read here, so the poll costs no extra queries.
		const aiTeams = seats.filter((m) => m.isAi && m.team != null).map((m) => m.team as number)
		const isAiDriver = seats.find((m) => !m.isAi)?.userSession === userSession

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

		return json({ events, lastEventId, turnDeadline, aiTeams, isAiDriver, clientSeq })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		await logToErrorDb(msg)
		throw error(500, 'Could not load game events')
	}
}
