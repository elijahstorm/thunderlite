import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { gameStore, MAX_PLAYERS } from '$lib/Game/store.server'
import { queryUsersByAuth } from '$lib/Database/getUserData'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

/** Seat-indexed public profiles for the room, so group chat can name authors. */
const buildRoster = async (session: string, me: string): Promise<(UserDBData | null)[]> => {
	try {
		const seats = await gameStore.roster(session)
		const auths = seats.map((s) => s.userAuth).filter((a): a is string => !!a)
		const byAuth = new Map((await queryUsersByAuth(auths, me)).map((u) => [u.auth, u]))
		return [...seats]
			.sort((a, b) => a.seat - b.seat)
			.map((s) => (s.userAuth ? (byAuth.get(s.userAuth) ?? null) : null))
	} catch (msg) {
		logToErrorDb(msg)
		return []
	}
}

/**
 * Pre-game lobby for a single room. Members wait here while the room fills;
 * once it's full a 10s countdown (armed at the filling join) opens `/play`, and
 * the host can skip it. A member who lands here after the match already started
 * is forwarded straight into `/play` so a refresh mid-game doesn't strand them.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	// Room, seat, count and roster are independent reads — resolve in one barrier.
	const [room, seat, count, roster] = await Promise.all([
		gameStore.getRoom(session),
		gameStore.seatOf(session, userSession),
		gameStore.memberCount(session),
		buildRoster(session, locals.user ?? ''),
	])
	if (!room) throw redirect(303, '/rooms')
	if (seat < 0) throw redirect(303, '/rooms')

	// Already started — the lobby is done; drop the member into the game.
	if (room.start_at != null && room.start_at <= Date.now()) throw redirect(303, '/play')

	return {
		session,
		mapId: room.map_id,
		seat,
		isHost: seat === 0,
		count,
		maxPlayers: MAX_PLAYERS,
		startAt: room.start_at ?? null,
		roster,
	}
}
