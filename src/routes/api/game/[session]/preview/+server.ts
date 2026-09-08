import { error, json } from '@sveltejs/kit'
import { gameStore } from '$lib/Game/store.server'
import { getMapData } from '$lib/Map/hashLoader'

/**
 * Read-only ingredients for a static board preview: the map hash and the raw
 * action log. The client folds these itself (see `$lib/Engine/asyncPreview`) —
 * this never runs the engine, so it can't affect the match.
 */
export const GET = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	if (!session) throw error(400, 'Missing session')

	const [room, seats] = await Promise.all([gameStore.getRoom(session), gameStore.roster(session)])
	if (!room) throw error(404, 'Game session not found')

	const seat = seats.find((m) => m.userSession === userSession)
	if (!seat) throw error(403, 'Not a member of this game session')

	const [{ mapHash }, log] = await Promise.all([
		getMapData(room.map_id),
		gameStore.events(session, -1),
	])

	return json({
		mapHash,
		actions: log.events.map((e) => e.action),
		localTeam: seat.team ?? 0,
	})
}
