import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore, roomCapacity } from '$lib/Game/store.server'
import { getMapData } from '$lib/Map/hashLoader'
import { teamsFromHash } from '$lib/Game/mapTeams'
import { realtime } from '$lib/dontcode/server'

/**
 * Host start — release the lobby now instead of waiting out its countdown, and
 * hand every side that nobody took to the CPU.
 *
 * A room holds one seat per side its map fields, so a three- or four-side board
 * routinely has more seats than there are people to fill them. Rather than
 * making the host recruit a full house (or, worse, starting with a side that has
 * no commander at all — which deadlocks the match the moment the turn rotation
 * reaches it), the host may start whenever every human present has readied up:
 * the free seats become CPU seats, driven by the lowest-seat human.
 *
 * Rules:
 *  - host only (seat 0), and only before the match has started;
 *  - live rooms need every human seat readied — the fill is explicit consent to
 *    play the rest of the board against the AI, not a bypass of that gate;
 *  - async rooms can't have CPU seats at all (an offline driver would let the
 *    AI's turn clock expire), so they still need a genuinely full room.
 *
 * The realtime push lets the other lobbies jump without waiting for their next
 * poll; the persisted `start_at` is the source of truth a refresh falls back to.
 */
export const POST = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	if (!session) throw error(400, 'Missing session')

	try {
		const room = await gameStore.getRoom(session)
		if (!room) throw error(404, 'Game session does not exist')
		if (room.start_at != null && Number(room.start_at) <= Date.now()) {
			throw error(409, 'The match has already started')
		}

		const seat = await gameStore.seatOf(session, userSession)
		if (seat < 0) throw error(403, 'Not a member of this game session')
		if (seat !== 0) throw error(403, 'Only the host can start the match')

		const capacity = roomCapacity(room)
		const isAsync = room.mode === 'async'
		const ready = await gameStore.readyState(session, room)

		if (isAsync) {
			// No CPU seats in correspondence play — the room has to be genuinely full.
			if (!ready.full) throw error(409, 'Waiting for another player to join')
		} else {
			if (!ready.humansReady) throw error(409, 'Waiting for every player to ready up')
			// Sides nobody claimed are played by the AI. Do this BEFORE releasing the
			// lobby so the seats exist (and get their teams) while everyone is still
			// looking at the lobby, not mid-handoff.
			if (!ready.full) await gameStore.fillWithAi(session)
		}

		// Assign the sides now: a CPU seat added a moment ago has no team yet, and
		// `/play` deriving it per-client is what the server-owned assignment
		// replaced. Idempotent — a member who picked a side in the lobby keeps it.
		try {
			const { mapHash } = await getMapData(room.map_id)
			const teams = await teamsFromHash(mapHash)
			if (teams.length) await gameStore.assignTeamsIfNeeded(session, teams)
		} catch (msg) {
			// A map read failure must not block the start: the `/play` loader runs the
			// same assignment on its way in.
			await logToErrorDb(msg)
		}

		const count = await gameStore.memberCount(session)
		const startAt = await gameStore.startNow(session)
		await realtime.tryPublish(`game:${session}`, { lobby: { count, startAt } })

		return json({ startAt, count, maxPlayers: capacity })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		await logToErrorDb(msg)
		throw error(500, 'Could not start the match')
	}
}
