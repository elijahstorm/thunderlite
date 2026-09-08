import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import { db } from '$lib/dontcode/server'

/**
 * Load a stored map's serialized data by its `public_id`. The base62 map blob
 * lives inline in the `maps.map_data` column now (it used to be a `.txt` file in
 * object storage that this had to fetch over HTTP), so a single row read returns
 * everything the play/editor pages need.
 */
export const getMapData = async (mapId: string) => {
	let map: { map_data: string; name: string; status: string; deleted_at: string | null } | null

	try {
		map = await db.findOne<{
			map_data: string
			name: string
			status: string
			deleted_at: string | null
		}>('maps', {
			where: { public_id: mapId },
			select: ['map_data', 'name', 'status', 'deleted_at'],
		})
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not get map from database')
	}

	if (!map) {
		throw error(400, { message: 'No map with that link found.' })
	}

	// `name` rides alongside the blob because the compact hash deliberately omits
	// the title (see mapExporter#filter) — it lives only in this column.
	//
	// Deliberately not gated on `deleted_at`: this is the only read path live
	// rooms, async turns, and replays use to rebuild the board, and a
	// soft-deleted map must keep serving in-progress/finished games. Callers
	// that need to know still get `mapDeleted` back to show a notice.
	return { mapHash: map.map_data, mapName: map.name, mapDeleted: !!map.deleted_at }
}

// Room creation gate only — a soft-deleted map is treated as nonexistent here,
// even though getMapData above keeps serving it for games already in flight.
export const isValidMapId = async (mapId: string) => {
	try {
		return (await db.count('maps', { public_id: mapId, deleted_at: null })) > 0
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not perform count check on database')
	}
}
