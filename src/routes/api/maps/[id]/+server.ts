import { error, json } from '@sveltejs/kit'
import { db, storage } from '$lib/dontcode/server'
import { logToErrorDb } from '$lib/Security/serverLogs'

/**
 * Delete a map the caller owns, by its `public_id`.
 *
 * Live game rooms load their board from this row on every read (game_room only
 * stores `map_id`), so deleting a map mid-match would brick that game — those
 * deletes are refused until the room's lazy TTL (`expires_at`) passes. The
 * social rows keyed by the map's internal id are swept alongside so nothing
 * orphans, and the thumbnail cleanup is best-effort (an orphaned PNG in
 * storage is harmless).
 */
export const DELETE = async ({ params, locals }) => {
	const owner = locals.user
	if (!owner) throw error(401, { message: 'Sign in to delete a map.' })

	const map = await db.findOne<{ id: number; owner_auth: string }>('maps', {
		where: { public_id: params.id },
		select: ['id', 'owner_auth'],
	})
	if (!map) throw error(404, { message: 'That map no longer exists.' })
	if (map.owner_auth !== owner) {
		throw error(403, { message: 'You can only delete maps you own.' })
	}

	const activeRooms = await db.count('game_room', {
		map_id: params.id,
		expires_at: { gt: Date.now() },
	})
	if (activeRooms > 0) {
		throw error(409, {
			message: 'This map is being played in an active game room. Try again once the match ends.',
		})
	}

	try {
		await Promise.all([
			db.delete('likes', { map_id: map.id }),
			db.delete('info_morph_map', { entity_id: map.id, entity_type: 'maps' }),
			db.delete('share_morph_map', { entity_id: map.id, entity_type: 'map' }),
		])
		await db.delete('maps', { public_id: params.id })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, { message: 'Could not delete map.' })
	}

	try {
		await storage.removePublic([`maps/${params.id}.png`])
	} catch (msg) {
		logToErrorDb(msg)
	}

	return json({ deleted: true })
}
