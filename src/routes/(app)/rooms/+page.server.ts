import type { PageServerLoad } from './$types'
import { gameStore } from '$lib/Game/store.server'
import { db } from '$lib/dontcode/server'

const PAGE_SIZE = 8

export const load: PageServerLoad = async ({ locals, url }) => {
	const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0') || 0)

	const [gameData, { rooms, hasMore }] = await Promise.all([
		locals.session ? gameStore.currentGame(locals.session) : Promise.resolve(null),
		gameStore.listPublicRooms(page, PAGE_SIZE),
	])

	// Enrich with map names for a friendlier list (the store stays map-agnostic).
	const mapIds = [...new Set(rooms.map((r) => r.mapId))]
	const names = mapIds.length
		? await db
				.find<{ public_id: string; name: string }>('maps', {
					where: { public_id: { in: mapIds } },
					select: ['public_id', 'name'],
				})
				.catch(() => [])
		: []
	const nameById = new Map(names.map((m) => [m.public_id, m.name]))
	const openRooms = rooms.map((r) => ({ ...r, mapName: nameById.get(r.mapId) ?? 'Custom map' }))

	return {
		user: locals.user,
		session: locals.session,
		gameData,
		openRooms,
		page,
		hasMore,
	}
}
