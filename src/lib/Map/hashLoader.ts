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
	let map: { map_data: string; name: string; status: string } | null

	try {
		map = await db.findOne<{ map_data: string; name: string; status: string }>('maps', {
			where: { public_id: mapId },
			select: ['map_data', 'name', 'status'],
		})
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not get map from database')
	}

	if (!map) {
		throw error(400, { message: 'No map with that link found.' })
	}

	// `name` rides alongside the blob because the compact hash deliberately omits
	// the title (see mapExporter#filter) — it lives only in this column.
	return { mapHash: map.map_data, mapName: map.name }
}

export const isValidMapId = async (mapId: string) => {
	try {
		return (await db.count('maps', { public_id: mapId })) > 0
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not perform count check on database')
	}
}
