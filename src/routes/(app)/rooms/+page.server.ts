import type { PageServerLoad } from './$types'
import { gameStore } from '$lib/Game/store.server'
import { db } from '$lib/dontcode/server'

const PAGE_SIZE = 8

/**
 * Matchmaking: the rooms you can join right now, plus the live room you are
 * already sitting in. Correspondence games moved to `/games` — mixing "a list
 * you return to for weeks" into a page about finding a game to start made both
 * halves harder to read.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0') || 0)

	const [current, { rooms, hasMore }] = await Promise.all([
		locals.session ? gameStore.currentGame(locals.session) : Promise.resolve(null),
		gameStore.listPublicRooms(page, PAGE_SIZE),
	])

	// The pointer, but only when it points at a LIVE room. An async game also
	// sets it on join, and that one belongs on the games hub, not here.
	const liveGame = current && current.room?.mode !== 'async' ? current : null

	// Enrich with map names for a friendlier list (the store stays map-agnostic).
	const mapIds = [...new Set([...rooms.map((r) => r.mapId), ...(liveGame ? [liveGame.mapId] : [])])]
	const names = mapIds.length
		? await db
				.find<{ public_id: string; name: string }>('maps', {
					where: { public_id: { in: mapIds } },
					select: ['public_id', 'name'],
				})
				.catch(() => [])
		: []
	const nameById = new Map(names.map((m) => [m.public_id, m.name]))

	return {
		user: locals.user,
		session: locals.session,
		gameData: liveGame
			? {
					session: liveGame.session,
					mapId: liveGame.mapId,
					mapName: nameById.get(liveGame.mapId) ?? 'Custom map',
					started: liveGame.room?.start_at != null && Number(liveGame.room.start_at) <= Date.now(),
				}
			: null,
		openRooms: rooms.map((r) => ({ ...r, mapName: nameById.get(r.mapId) ?? 'Custom map' })),
		page,
		hasMore,
	}
}
