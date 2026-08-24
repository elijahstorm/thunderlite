import { error, json } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { db } from '$lib/dontcode/server'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

/**
 * Daily prune of stale DMs. DM history is a convenience, not a system of record
 * (see the chat redesign), so anything older than a week is deleted to keep the
 * messages table small.
 *
 * Invoked by the Vercel cron declared in vercel.json. Vercel attaches
 * `Authorization: Bearer ${CRON_SECRET}` automatically when CRON_SECRET is set
 * in the project env; we require it so the endpoint can't be triggered by anyone
 * who guesses the path. `/api/cron` is intentionally NOT a protected route — it
 * authenticates with this shared secret, not a user session.
 */
const RETENTION_DAYS = 7

export const GET = async ({ request }) => {
	const secret = env.CRON_SECRET
	if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
		throw error(401, 'Unauthorized')
	}

	const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

	try {
		const { count } = await db.delete('messages', { created_at: { lt: cutoff } })
		return json({ deleted: count, cutoff })
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not prune messages')
	}
}
