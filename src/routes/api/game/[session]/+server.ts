import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore, roomCapacity } from '$lib/Game/store.server'

/**
 * Lobby state for a room member — polled by the pre-game lobby (and a realtime
 * push accelerates it). Deliberately returns only counts and the caller's own
 * seat: `user_session` values are server-derived auth identities and must never
 * reach another player's browser. Arming the countdown here too (when the room
 * is already full and everyone has readied but it never got armed) makes the
 * handoff self-heal if the join-time arm was lost.
 */
export const GET = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	if (!session) throw error(400, 'Missing session')

	try {
		// Both reads are independent — resolve them in one barrier rather than two
		// serial hops, since this endpoint is polled by the lobby. The roster also
		// covers the seat lookup and the head count, so it replaces both.
		const [room, roster] = await Promise.all([
			gameStore.getRoom(session),
			gameStore.roster(session),
		])
		if (!room) throw error(404, 'Game session does not exist')
		const me = roster.find((r) => r.userSession === userSession)
		if (!me) throw error(403, 'Not a member of this game session')

		const seat = me.seat
		const count = roster.length
		// Capacity is the room's own (one seat per side its map fields), so a
		// four-side board reads 2/4 here rather than pretending to be full at 2.
		const maxPlayers = roomCapacity(room)
		const full = count >= maxPlayers
		// Live rooms hold the countdown until every human seat readies up; async
		// rooms release on their own (their players are expected to be away).
		const isAsync = room.mode === 'async'
		const humans = roster.filter((r) => !r.isAi)
		const readyCount = humans.filter((r) => r.ready).length
		// `humansReady` — everyone HERE has confirmed — is what enables the host's
		// start button, which fills the seats nobody took with CPUs. The automatic
		// countdown still needs a full house on top of that (`allReady`).
		const humansReady = humans.length > 0 && readyCount === humans.length
		const allReady = full && humansReady
		const clearedToStart = isAsync ? full : allReady

		// Self-heal the countdown in both directions: a room cleared to start that
		// never got armed starts ticking now; a room that lost its clearance before
		// the countdown fired disarms, so the next time it qualifies it re-arms a
		// fresh 10s instead of resuming a stale clock.
		let startAt = room.start_at
		if (clearedToStart && startAt == null) {
			startAt = await gameStore.armStartCountdown(session)
		} else if (!clearedToStart && startAt != null && Number(startAt) > Date.now()) {
			// Only a countdown that hasn't fired disarms. A room past its start_at
			// is an in-progress match (e.g. one seat resigned away) — resetting it
			// would throw the surviving player back into a lobby state.
			await gameStore.disarmCountdown(session)
			startAt = null
		}

		return json({
			session,
			mapId: room.map_id,
			seat,
			isHost: seat === 0,
			count,
			maxPlayers,
			full,
			startAt: startAt ?? null,
			// Readiness, so the lobby can render the gate without a full loader
			// round-trip on every poll. `ready` is the caller's own flag.
			requiresReady: !isAsync,
			ready: me.ready,
			readyCount,
			humanCount: humans.length,
			allReady,
			// The host may start a room that never filled: the empty sides become
			// CPU seats (see the start endpoint). Async rooms have no CPU seats, so
			// there it stays a full-house requirement.
			canHostStart: isAsync ? full : humansReady,
		})
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		await logToErrorDb(msg)
		throw error(500, 'Could not load game session')
	}
}
