import { error, json } from '@sveltejs/kit'
import { isDontCodeError, realtime } from '$lib/dontcode/server'
import { gameStore } from '$lib/Game/store.server'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

/**
 * Mints a short-lived, channel-scoped realtime connection token for the
 * browser (see $lib/dontcode/realtimeClient.ts for the client half). This is
 * the authorization boundary for realtime: the platform grants whatever
 * channels we put in the token, so every requested channel must be checked
 * against what THIS user may see before minting.
 *
 * Channel policy:
 *   game:{session} — members of that game room only
 *   chat:global    — any signed-in user
 *
 * Identity is the caller's opaque `userSession` (server-derived, unspoofable,
 * not a secret), so channel presence lines up with game_member rows.
 */

/** Token lifetime. Long enough for a play session; the client re-mints on reconnect. */
const TOKEN_TTL_SECONDS = 60 * 60

const authorizeChannel = async (channel: string, userSession: string): Promise<boolean> => {
	if (channel === 'chat:global') return true
	const game = channel.match(/^game:(.+)$/)
	if (game) return gameStore.isMember(game[1], userSession)
	return false
}

export const POST = async ({ request, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	let body: unknown
	try {
		body = await request.json()
	} catch {
		throw error(400, 'Invalid JSON body')
	}
	const requested = (body as { channels?: unknown })?.channels
	if (!Array.isArray(requested) || requested.length === 0) {
		throw error(400, 'channels is required')
	}
	const channels = requested.map(String)

	for (const channel of channels) {
		if (!(await authorizeChannel(channel, userSession))) {
			throw error(403, `Not allowed to join channel ${channel}`)
		}
	}

	try {
		const token = await realtime.mintToken({
			channels,
			identity: userSession,
			ttl: TOKEN_TTL_SECONDS,
		})
		return json(token)
	} catch (msg) {
		// A 404 from the gateway means it simply has no realtime service (the
		// local mock) — expected, not worth logging. Callers treat any failed
		// mint as "no realtime" and fall back to polling.
		if (!(isDontCodeError(msg) && msg.status === 404)) logToErrorDb(msg)
		throw error(503, 'Realtime is not available')
	}
}
