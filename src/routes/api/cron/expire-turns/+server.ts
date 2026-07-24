import { error, json } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore } from '$lib/Game/store.server'
import { notifyAsyncTimeout } from '$lib/Game/asyncNotify.server'
import { clampAsyncTimeout } from '$lib/Game/asyncConfig'

/**
 * Hourly sweep of async games whose turn deadline passed: the current player
 * is auto-resigned and both sides get an email. This is the backstop for games
 * NOBODY has open — the same enforcement also runs lazily on the move/events/
 * heartbeat endpoints, so anyone actually looking at a game resolves it sooner.
 * With turn clocks of half a day and up, hourly resolution is plenty.
 *
 * Auth matches the other cron: Vercel attaches `Authorization: Bearer
 * ${CRON_SECRET}` when CRON_SECRET is set in the project env; `/api/cron` is
 * intentionally NOT a session-protected route.
 */
export const GET = async ({ request }) => {
	const secret = env.CRON_SECRET
	if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
		throw error(401, 'Unauthorized')
	}

	try {
		const rooms = await gameStore.expiredAsyncTurns()
		let resigned = 0
		for (const room of rooms) {
			try {
				const enforced = await gameStore.enforceTurnDeadline(room.session, room)
				if (!enforced) continue
				resigned++
				await notifyAsyncTimeout(room.session, enforced, clampAsyncTimeout(room.turn_timeout_ms))
			} catch (msg) {
				// One broken room must not stall the rest of the sweep.
				logToErrorDb(msg)
			}
		}
		return json({ checked: rooms.length, resigned })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not sweep expired turns')
	}
}
