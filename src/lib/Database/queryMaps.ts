import { error } from '@sveltejs/kit'
import { getUserDBDataFromAuth } from './getUserData'
import { logToErrorDb } from '$lib/Security/serverLogs'
import { db, type Where } from '$lib/dontcode/server'

type MapRow = MapDBData & { map_type_id: number | null }

export const queryMaps: (
	props: {
		search?: string
		type?: string
		page?: number
	},
	me?: string
) => Promise<{ maps: MapDBData[]; users: UserDBData[] }> = async (
	{ search = '', type = '', page = 0 },
	me = ''
) => {
	let maps: MapDBData[]
	const limit = 10

	try {
		const where: Where = { status: { not: 'private' } }

		// Replaces the map_types join filter: resolve the type text to ids first.
		if (type !== '') {
			const matchingTypes = await db.find<{ id: number }>('map_types', {
				where: { text: type },
				select: ['id'],
			})
			if (matchingTypes.length === 0) return { maps: [], users: [] }
			where.map_type_id = { in: matchingTypes.map((mapType) => mapType.id) }
		}

		if (search !== '') {
			where.OR = [
				{ name: { contains: search, mode: 'insensitive' } },
				{ description: { contains: search, mode: 'insensitive' } },
			]
		}

		// The grouping/aggregation never changed the row count (it was grouped by
		// maps.id), so limit/offset still apply directly to the maps query; the
		// old joins become batched `in` lookups composed in JS below.
		const rows = await db.find<MapRow>('maps', {
			where,
			orderBy: { created_at: 'asc' },
			limit,
			offset: page * limit,
		})

		const mapIds = rows.map((map) => map.id)
		const typeIds = [...new Set(rows.map((map) => map.map_type_id).filter((id) => id !== null))]

		const [mapTypes, infoMorphs, likes, shares] = mapIds.length
			? await Promise.all([
					typeIds.length
						? db.find<{ id: number; text: string }>('map_types', {
								where: { id: { in: typeIds } },
							})
						: Promise.resolve([]),
					db.find<{ info_id: number | null; entity_id: number }>('info_morph_map', {
						where: { entity_id: { in: mapIds }, entity_type: 'maps' },
						select: ['info_id', 'entity_id'],
					}),
					db.find<{ map_id: number; user_auth: string | null }>('likes', {
						where: { map_id: { in: mapIds } },
						select: ['map_id', 'user_auth'],
					}),
					db.find<{ entity_id: number }>('share_morph_map', {
						where: { entity_id: { in: mapIds }, entity_type: 'map' },
						select: ['entity_id'],
					}),
				])
			: [[], [], [], []]

		const infoIds = [
			...new Set(infoMorphs.map((morph) => morph.info_id).filter((id) => id !== null)),
		]
		const infos = infoIds.length
			? await db.find<{ id: number; info: string; color: string }>('info', {
					where: { id: { in: infoIds } },
				})
			: []

		const typeTexts = new Map(mapTypes.map((mapType) => [mapType.id, mapType.text]))
		const infosById = new Map(infos.map((info) => [info.id, info]))
		const oneMonthAgo = new Date()
		oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

		maps = rows.map((map) => {
			const mapLikes = likes.filter((like) => like.map_id === map.id)
			return {
				...map,
				type: (map.map_type_id !== null && typeTexts.get(map.map_type_id)) || null,
				info: infoMorphs
					.filter((morph) => morph.entity_id === map.id)
					.map((morph) => {
						const info = morph.info_id !== null ? infosById.get(morph.info_id) : undefined
						return { info: info?.info ?? null, color: info?.color ?? null }
					}),
				likes: mapLikes.length,
				shares: shares.filter((share) => share.entity_id === map.id).length,
				trending: new Date(map.created_at).getTime() >= oneMonthAgo.getTime(),
				liked_by_me: mapLikes.some((like) => like.user_auth === me),
			} as unknown as MapDBData
		})
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not get map from database')
	}

	const users = (await Promise.all(
		Object.values(
			maps.reduce(
				(users, map) => {
					if (users[map.owner_auth]) return users
					users[map.owner_auth] = getUserDBDataFromAuth(map.owner_auth, me)
					return users
				},
				{} as { [key: string]: Promise<UserDBData> | undefined }
			)
		)
	)) as UserDBData[]

	return {
		maps,
		users,
	}
}
