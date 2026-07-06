import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { gameStore, MAX_PLAYERS } from '$lib/Game/store.server'

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
	const room = await gameStore.getRoom(session)
	if (!room) throw redirect(303, '/rooms')

	const seat = await gameStore.seatOf(session, userSession)
	if (seat < 0) throw redirect(303, '/rooms')

	// Already started — the lobby is done; drop the member into the game.
	if (room.start_at != null && room.start_at <= Date.now()) throw redirect(303, '/play')

	const count = await gameStore.memberCount(session)

	return {
		session,
		mapId: room.map_id,
		seat,
		isHost: seat === 0,
		count,
		maxPlayers: MAX_PLAYERS,
		startAt: room.start_at ?? null,
	}
}
