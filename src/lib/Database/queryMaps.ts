import { error } from '@sveltejs/kit'
import { getUserDBDataFromAuth, queryUsersByAuth } from './getUserData'
import { logToErrorDb } from '$lib/Security/serverLogs'
import { db, type Where } from '$lib/dontcode/server'

type MapRow = MapDBData & { map_type_id: number | null }

// Columns the listing/landing rows need — deliberately excludes the heavy
// `map_data` blob (only the play/editor loaders read that, via getMapData).
const MAP_LIST_COLUMNS = [
	'id',
	'public_id',
	'owner_auth',
	'name',
	'description',
	'thumbnail',
	'status',
	'plays',
	'created_at',
	'updated_at',
	'map_type_id',
]

// Single public map by its public_id, enriched the same way the /make listing
// rows are (type text, info chips, like/share/play counts, owner relationship).
// Backs the shareable /map/[id] landing page, so a private map returns null
// rather than leaking through a direct link.
export const getMapById: (
	mapId: string,
	me?: string
) => Promise<{ map: MapDBData; owner: UserDBData } | null> = async (mapId, me = '') => {
	try {
		const row = await db.findOne<MapRow & { status: string }>('maps', {
			where: { public_id: mapId },
			select: MAP_LIST_COLUMNS,
		})
		if (!row || row.status === 'private') return null

		const [mapType, infoMorphs, likes, shares] = await Promise.all([
			row.map_type_id !== null
				? db.findOne<{ text: string }>('map_types', {
						where: { id: row.map_type_id },
						select: ['text'],
					})
				: Promise.resolve(null),
			db.find<{ info_id: number | null }>('info_morph_map', {
				where: { entity_id: row.id, entity_type: 'maps' },
				select: ['info_id'],
			}),
			db.find<{ user_auth: string | null }>('likes', {
				where: { map_id: row.id },
				select: ['user_auth'],
			}),
			db.count('share_morph_map', { entity_id: row.id, entity_type: 'map' }),
		])

		const infoIds = [
			...new Set(infoMorphs.map((morph) => morph.info_id).filter((id) => id !== null)),
		]
		const infos = infoIds.length
			? await db.find<{ id: number; info: string; color: string }>('info', {
					where: { id: { in: infoIds } },
				})
			: []
		const infosById = new Map(infos.map((info) => [info.id, info]))
		const oneMonthAgo = new Date()
		oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

		const map = {
			...row,
			type: mapType?.text ?? null,
			info: infoMorphs.map((morph) => {
				const info = morph.info_id !== null ? infosById.get(morph.info_id) : undefined
				return { info: info?.info ?? null, color: info?.color ?? null }
			}),
			likes: likes.length,
			shares,
			trending: new Date(row.created_at).getTime() >= oneMonthAgo.getTime(),
			liked_by_me: likes.some((like) => like.user_auth === me),
		} as unknown as MapDBData

		const owner = await getUserDBDataFromAuth(row.owner_auth, me)

		return { map, owner }
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not get map from database')
	}
}

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
			select: MAP_LIST_COLUMNS,
			orderBy: { created_at: 'asc' },
			limit,
			offset: page * limit,
		})

		const mapIds = rows.map((map) => map.id)
		const typeIds = [...new Set(rows.map((map) => map.map_type_id).filter((id) => id !== null))]

		// The per-map detail lookups and the owner hydration both depend only on
		// the maps rows, so run them in a single barrier instead of in series.
		// queryUsersByAuth collapses what used to be 1 + 4 calls PER owner into
		// one batched wave (and zero social calls when logged out).
		const detailsPromise = mapIds.length
			? Promise.all([
					typeIds.length
						? db.find<{ id: number; text: string }>('map_types', {
								where: { id: { in: typeIds } },
							})
						: Promise.resolve<{ id: number; text: string }[]>([]),
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
			: Promise.resolve([[], [], [], []] as [
					{ id: number; text: string }[],
					{ info_id: number | null; entity_id: number }[],
					{ map_id: number; user_auth: string | null }[],
					{ entity_id: number }[],
				])

		// The info lookup depends only on info_morph_map (from the details wave),
		// not on the owner hydration — so chain it onto details and let it run
		// concurrently with queryUsersByAuth rather than after both complete.
		const detailsWithInfo = detailsPromise.then(async ([mapTypes, infoMorphs, likes, shares]) => {
			const infoIds = [
				...new Set(infoMorphs.map((morph) => morph.info_id).filter((id) => id !== null)),
			]
			const infos = infoIds.length
				? await db.find<{ id: number; info: string; color: string }>('info', {
						where: { id: { in: infoIds } },
					})
				: []
			return { mapTypes, infoMorphs, likes, shares, infos }
		})

		const [{ mapTypes, infoMorphs, likes, shares, infos }, users] = await Promise.all([
			detailsWithInfo,
			queryUsersByAuth(
				rows.map((map) => map.owner_auth),
				me
			),
		])

		const typeTexts = new Map(mapTypes.map((mapType) => [mapType.id, mapType.text]))
		const infosById = new Map(infos.map((info) => [info.id, info]))
		const oneMonthAgo = new Date()
		oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

		const maps = rows.map((map) => {
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

		return { maps, users }
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not get map from database')
	}
}

// Per-user quota — keep in sync with MAX_MAPS_PER_USER in api/upload.
export const MAX_MAPS_PER_USER = 30

/**
 * Every map owned by `owner` (drafts and published), newest first, for the
 * /my/maps library. Lighter than {@link queryMaps}: no info/like/share joins,
 * just the row metadata the library cards need, plus the remaining quota.
 */
/**
 * Another player's public maps, for their profile page. Same shape as the
 * listing rows but excludes private drafts (mirrors the `status` gate in
 * getMapById), so a profile never leaks a map its owner hasn't shared.
 */
export const queryUserPublicMaps: (owner: string) => Promise<{ maps: MapDBData[] }> = async (
	owner
) => {
	if (!owner) return { maps: [] }
	try {
		const rows = await db.find<MapRow & { status: string }>('maps', {
			where: { owner_auth: owner, status: { not: 'private' } },
			select: MAP_LIST_COLUMNS,
			orderBy: { updated_at: 'desc' },
		})
		const maps = rows.map(
			(row) =>
				({
					...row,
					type: null,
					info: [],
					likes: 0,
					shares: 0,
					trending: false,
					liked_by_me: 0,
				}) as unknown as MapDBData
		)
		return { maps }
	} catch (msg) {
		await logToErrorDb(msg)
		return { maps: [] }
	}
}

export const queryMyMaps: (
	owner: string
) => Promise<{ maps: MapDBData[]; limit: number; remaining: number }> = async (owner) => {
	if (!owner) return { maps: [], limit: MAX_MAPS_PER_USER, remaining: MAX_MAPS_PER_USER }
	try {
		const rows = await db.find<MapRow>('maps', {
			where: { owner_auth: owner },
			select: MAP_LIST_COLUMNS,
			orderBy: { updated_at: 'desc' },
		})
		const maps = rows.map(
			(row) =>
				({
					...row,
					type: null,
					info: [],
					likes: 0,
					shares: 0,
					trending: false,
					liked_by_me: 0,
				}) as unknown as MapDBData
		)
		return {
			maps,
			limit: MAX_MAPS_PER_USER,
			remaining: Math.max(0, MAX_MAPS_PER_USER - maps.length),
		}
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not load your maps')
	}
}
