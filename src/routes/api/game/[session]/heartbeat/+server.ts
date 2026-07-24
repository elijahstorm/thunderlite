import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore } from '$lib/Game/store.server'
import { notifyAsyncTimeout } from '$lib/Game/asyncNotify.server'
import { clampAsyncTimeout } from '$lib/Game/asyncConfig'

/**
 * Presence heartbeat for an in-match player, pinged by GameSocket while on
 * /play. Records that this player is still here, then sweeps anyone else who
 * stopped checking in (left and didn't return) — auto-resigning them so an
 * abandoned match can't stall forever. Runs on its own short interval rather
 * than the event poll, which throttles to ~30s once realtime is connected.
 *
 * Async rooms skip the presence sweep entirely: being gone between turns is
 * the whole point of async play, so absence never means abandonment there.
 * Their timeout is the turn deadline instead, enforced here lazily too.
 */
export const POST = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const session = params.session
	if (!session) throw error(400, 'Missing session')

	try {
		if (!(await gameStore.isMember(session, userSession))) {
			return json({ ok: false })
		}
		await gameStore.touchMember(session, userSession)
		const room = await gameStore.getRoom(session)
		if (room?.mode === 'async') {
			const enforced = await gameStore.enforceTurnDeadline(session, room)
			if (enforced) {
				await notifyAsyncTimeout(session, enforced, clampAsyncTimeout(room.turn_timeout_ms))
			}
			return json({ ok: true, resigned: !!enforced })
		}
		const resigned = await gameStore.sweepAbsent(session, userSession)
		return json({ ok: true, resigned })
	} catch (msg) {
		logToErrorDb(msg)
		// Never surface heartbeat failures to the client — it's best-effort.
		return json({ ok: false })
	}
}
