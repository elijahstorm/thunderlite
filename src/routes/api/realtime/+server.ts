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
 *   chat:{session} — members of that game room only (ephemeral group chat)
 *   chat:global    — any signed-in user (presence backbone for "who's online")
 *   dm:{auth}      — a user's own private mailbox; only that user may join it
 *
 * Identity depends on the channel set. Game channels use the opaque `userSession`
 * so presence lines up with game_member rows. Chat/DM channels use the profile
 * `auth` id so `presence('chat:global')` yields ids we can hydrate to profiles
 * for the online-users list (see /api/chat/online).
 */

/** Token lifetime. Long enough for a play session; the client re-mints on reconnect. */
const TOKEN_TTL_SECONDS = 60 * 60

const authorizeChannel = async (
	channel: string,
	{ auth, userSession }: { auth: string; userSession: string }
): Promise<boolean> => {
	if (channel === 'chat:global') return true
	const dm = channel.match(/^dm:(.+)$/)
	if (dm) return dm[1] === auth // you may only listen on your own mailbox
	const room = channel.match(/^(?:game|chat):(.+)$/)
	if (room) return gameStore.isMember(room[1], userSession)
	return false
}

export const POST = async ({ request, locals }) => {
	const userSession = locals.session
	const auth = locals.user
	if (!userSession || !auth) throw error(401, 'User not logged in')

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
		if (!(await authorizeChannel(channel, { auth, userSession }))) {
			throw error(403, `Not allowed to join channel ${channel}`)
		}
	}

	// Game channels need `userSession` identity (matches game_member rows); chat
	// and DM channels need the profile `auth` so presence resolves to profiles.
	const identity = channels.some((channel) => channel.startsWith('game:'))
		? userSession
		: auth

	try {
		const token = await realtime.mintToken({
			channels,
			identity,
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
