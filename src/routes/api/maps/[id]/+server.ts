import { error, json } from '@sveltejs/kit'
import { db, storage } from '$lib/dontcode/server'
import { logToErrorDb } from '$lib/Security/serverLogs'

/**
 * Soft-delete a map the caller owns, by its `public_id`.
 *
 * Live/async game rooms and replays load their board from this row on every
 * read (game_room/matches only store `map_id`), so the row itself is kept
 * around with `deleted_at` set rather than removed — in-progress matches and
 * their replays keep working after deletion (see getMapData, which
 * deliberately ignores `deleted_at`). Discovery surfaces and new-game
 * creation filter deleted maps out instead. The social rows keyed by the
 * map's internal id are swept immediately since nothing gameplay-relevant
 * depends on them, and the thumbnail cleanup is best-effort (an orphaned PNG
 * in storage is harmless).
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

	try {
		await Promise.all([
			db.delete('likes', { map_id: map.id }),
			db.delete('info_morph_map', { entity_id: map.id, entity_type: 'maps' }),
			db.delete('share_morph_map', { entity_id: map.id, entity_type: 'map' }),
		])
		await db.update('maps', { public_id: params.id }, { deleted_at: new Date() })
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, { message: 'Could not delete map.' })
	}

	try {
		await storage.removePublic([`maps/${params.id}.png`])
	} catch (msg) {
		await logToErrorDb(msg)
	}

	return json({ deleted: true })
}
