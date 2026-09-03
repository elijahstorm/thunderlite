import { error, json } from '@sveltejs/kit'
import { gameStore } from '$lib/Game/store.server'
import { storage } from '$lib/dontcode/server'
import { noteRateLimit } from '$lib/Security/rateLimit'
import { tracePath } from '$lib/Game/traceArchive'

/**
 * A client's whole diagnostic trace for a match, archived once at the end.
 *
 * The trace used to be flushed to the database every couple of seconds for the
 * whole match: one `game_log` row per flush per client, about as many writes as
 * the match itself produced. At two hundred rooms that alone was sixteen times
 * the project's write budget, for a record one person reads afterwards, if at
 * all. So the recorder now keeps the trace in the browser and ships it here once,
 * when the match ends, into private storage: one `storage` call per client per
 * match, on a budget nothing else in the sync path touches. Evidence of trouble
 * (a desync, a refused relay, a resync) still goes to `game_log` the moment it
 * happens, so a match that never reaches its end is not a match with no record.
 *
 * Private storage, never public: the trace holds both sides' fog and stealth.
 * `/log` GET reads it back for the room's own members, alongside the incident
 * rows. Overwrites are fine; the last upload for a client is the complete one.
 */
/** Well above a long match (match 24's whole trace was ~0.9 MB across two clients). */
const MAX_TRACE_BYTES = 4 * 1024 * 1024

export const POST = async ({ request, params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const session = params.session
	if (!session) throw error(400, 'Missing session')

	const body = await request.text()
	if (!body || body.length > MAX_TRACE_BYTES) return json({ stored: false })
	try {
		JSON.parse(body)
	} catch {
		return json({ stored: false })
	}

	try {
		const members = await gameStore.members(session)
		if (!members.includes(userSession)) throw error(403, 'Not a member of this game session')
		await storage.uploadPrivate(tracePath(session, userSession), body, 'application/json')
		return json({ stored: true })
	} catch (msg) {
		if (
			msg &&
			typeof msg === 'object' &&
			'status' in msg &&
			(msg as { status: number }).status === 403
		) {
			throw msg
		}
		// Diagnostics are never load-bearing: a failed archive is a missing file,
		// not an error the player sees. A refusal still feeds the breaker.
		noteRateLimit(msg, 'storage')
		return json({ stored: false })
	}
}
