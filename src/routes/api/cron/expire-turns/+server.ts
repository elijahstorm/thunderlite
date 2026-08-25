import { error, json } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore } from '$lib/Game/store.server'
import { budgetPressure } from '$lib/Security/rateLimit'
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
		let skipped = 0
		for (const room of rooms) {
			// Each room costs a handful of database calls to resign and notify, and
			// this sweep runs unattended against the same `db` budget live matches
			// are using. When that budget gets tight, stop: nobody is watching this
			// run, these games have already waited half a day, and the next sweep is
			// an hour away. A live match has none of those luxuries.
			if (budgetPressure('db')) {
				skipped = rooms.length - resigned
				break
			}
			try {
				const enforced = await gameStore.enforceTurnDeadline(room.session, room)
				if (!enforced) continue
				resigned++
				await notifyAsyncTimeout(room.session, enforced, clampAsyncTimeout(room.turn_timeout_ms))
			} catch (msg) {
				// One broken room must not stall the rest of the sweep.
				await logToErrorDb(msg)
			}
		}
		return json({ checked: rooms.length, resigned, skipped })
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not sweep expired turns')
	}
}
