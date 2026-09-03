import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore, LEAVE_GRACE_MS } from '$lib/Game/store.server'
import { realtime } from '$lib/dontcode/server'
import { notifyAsyncTimeout } from '$lib/Game/asyncNotify.server'
import { clampAsyncTimeout } from '$lib/Game/asyncConfig'

/**
 * Presence check for a live room, asked for by a client that has been waiting.
 *
 * This used to be a heartbeat: every client wrote `last_seen` every ten seconds
 * and swept whoever had stopped writing. Presence was a database column, and
 * keeping it fresh cost three reads and a write per ping per client, in every
 * room, whether or not anyone was wondering where anyone was. At two hundred
 * rooms that alone is eight times the project's write budget.
 *
 * Presence is not a database question. The realtime service already knows who
 * holds an open socket on `game:{session}`, with the identity the token was
 * minted for, which for game channels is the player's `userSession`. So nobody
 * reports being here any more; a client asks who is here, and only when the
 * room has gone quiet on it (see `STALL_CHECK_MS` in GameSocket). A healthy
 * room never makes this call. A stalled one makes it once a minute or so, and
 * it costs one roster read and one presence call.
 *
 * Two safeguards, both about not resigning someone on bad information:
 *
 *  - A player is only resigned after their socket has been gone for the whole
 *    grace window, observed across at least two checks. The first sighting is
 *    remembered in the cache; the resign happens on a later check that finds
 *    them still gone. A network blip mid-turn costs nothing.
 *  - The caller must be visible in presence themselves. If the service cannot
 *    see the one player we know is here, its answer about everyone else is not
 *    trusted, and nothing is swept. That is what keeps a realtime outage, or
 *    the local mock with no realtime at all, from resigning a whole room.
 *
 * Async rooms skip presence entirely: being gone between turns is the point of
 * async play. Their clock is the turn deadline, enforced here lazily as before.
 */
export const POST = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const session = params.session
	if (!session) throw error(400, 'Missing session')

	try {
		const [roster, room] = await Promise.all([
			gameStore.roster(session),
			gameStore.getRoom(session),
		])
		if (!roster.some((m) => m.userSession === userSession)) {
			return json({ ok: false })
		}
		if (room?.mode === 'async') {
			const enforced = await gameStore.enforceTurnDeadline(session, room)
			if (enforced) {
				await notifyAsyncTimeout(session, enforced, clampAsyncTimeout(room.turn_timeout_ms))
			}
			return json({ ok: true, resigned: !!enforced, waiting: [] })
		}

		let present: Set<string>
		try {
			present = new Set(
				(await realtime.presence(`game:${session}`))
					.map((m) => m.identity)
					.filter((id): id is string => typeof id === 'string')
			)
		} catch {
			// No realtime here (the local mock), or a hiccup. Not a reason to act.
			return json({ ok: true, resigned: false, waiting: [], unreliable: true })
		}
		if (!present.has(userSession)) {
			return json({ ok: true, resigned: false, waiting: [], unreliable: true })
		}

		const sweep = await gameStore.sweepDisconnected(session, userSession, roster, present)
		return json({
			ok: true,
			resigned: sweep.resigned.length > 0,
			// Who the room is waiting on, and how long they have. The client shows
			// this so an absence reads as a countdown, not a frozen board.
			waiting: sweep.waiting.map((w) => ({
				team: w.team,
				sinceMs: w.sinceMs,
				graceMs: LEAVE_GRACE_MS,
			})),
		})
	} catch (msg) {
		await logToErrorDb(msg)
		// Never surface presence failures to the client: it is best-effort.
		return json({ ok: false })
	}
}
