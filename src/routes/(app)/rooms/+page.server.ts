import type { PageServerLoad } from './$types'
import { gameStore } from '$lib/Game/store.server'
import { queryUsersByAuth } from '$lib/Database/getUserData'
import { db } from '$lib/dontcode/server'

const PAGE_SIZE = 8

export const load: PageServerLoad = async ({ locals, url }) => {
	const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0') || 0)

	const [gameData, { rooms, hasMore }, asyncGames] = await Promise.all([
		locals.session ? gameStore.currentGame(locals.session) : Promise.resolve(null),
		gameStore.listPublicRooms(page, PAGE_SIZE),
		// Unlike live play (one pointer), a player can have many async games in
		// flight at once — this is their whole list, your-turn games first.
		locals.session ? gameStore.listMyAsyncGames(locals.session) : Promise.resolve([]),
	])

	// Enrich with map names for a friendlier list (the store stays map-agnostic).
	const mapIds = [...new Set([...rooms.map((r) => r.mapId), ...asyncGames.map((g) => g.mapId)])]
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

	// Opponent display names for the async list.
	const opponentAuths = [
		...new Set(asyncGames.map((g) => g.opponentAuth).filter((a): a is string => !!a)),
	]
	const opponents = opponentAuths.length
		? await queryUsersByAuth(opponentAuths, locals.user ?? '').catch(() => [])
		: []
	const opponentByAuth = new Map(opponents.map((u) => [u.auth, u]))
	const myAsyncGames = asyncGames.map((g) => ({
		...g,
		mapName: nameById.get(g.mapId) ?? 'Custom map',
		opponent: g.opponentAuth ? (opponentByAuth.get(g.opponentAuth) ?? null) : null,
	}))

	return {
		user: locals.user,
		session: locals.session,
		gameData,
		openRooms,
		myAsyncGames,
		page,
		hasMore,
	}
}
