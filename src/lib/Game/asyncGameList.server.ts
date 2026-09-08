import { gameStore, type AsyncGameSummary } from '$lib/Game/store.server'
import { queryUsersByAuth } from '$lib/Database/getUserData'
import { db } from '$lib/dontcode/server'

export type AsyncGameListItem = AsyncGameSummary & {
	mapName: string
	opponent: UserDBData | null
}

/**
 * A player's correspondence games, dressed for display: map names and opponent
 * profiles resolved in one batch each, rather than per row. The store stays
 * map- and profile-agnostic; this is the seam where the two meet.
 */
export const listAsyncGames = async (
	userSession: string,
	me: string
): Promise<AsyncGameListItem[]> => {
	const games = await gameStore.listMyAsyncGames(userSession)
	if (games.length === 0) return []

	const mapIds = [...new Set(games.map((g) => g.mapId))]
	const opponentAuths = [
		...new Set(games.map((g) => g.opponentAuth).filter((a): a is string => !!a)),
	]

	const [names, opponents] = await Promise.all([
		db
			.find<{ public_id: string; name: string }>('maps', {
				where: { public_id: { in: mapIds } },
				select: ['public_id', 'name'],
			})
			.catch(() => []),
		opponentAuths.length ? queryUsersByAuth(opponentAuths, me).catch(() => []) : [],
	])

	const nameById = new Map(names.map((m) => [m.public_id, m.name]))
	const opponentByAuth = new Map(opponents.map((u) => [u.auth, u]))

	return games.map((g) => ({
		...g,
		mapName: nameById.get(g.mapId) ?? 'Custom map',
		opponent: g.opponentAuth ? (opponentByAuth.get(g.opponentAuth) ?? null) : null,
	}))
}
