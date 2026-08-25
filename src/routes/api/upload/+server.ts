import { error, json } from '@sveltejs/kit'
import { db, storage, isDontCodeError } from '$lib/dontcode/server'
import { generateMapId } from '$lib/Security/keys'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { wouldWipeBoard } from '$lib/Map/mapContent'

// Generous cap on the inbound thumbnail data URL (~3MB of base64). A PNG of a
// pixel-art board is far smaller; this just bounds an abusive/garbage payload.
const MAX_THUMBNAIL_CHARS = 3_000_000

// How many maps a single user may own. Counts both drafts and published maps —
// the editor library (/my/maps) surfaces the remaining headroom.
const MAX_MAPS_PER_USER = 30

// Retries for the (astronomically unlikely) public_id collision on insert.
const ID_RETRIES = 5

/** Decode a `data:<type>;base64,<data>` URL into bytes for storage upload. */
const parseDataUrl = (dataUrl: string): { contentType: string; bytes: Uint8Array } | null => {
	const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl)
	if (!match) return null
	return { contentType: match[1], bytes: new Uint8Array(Buffer.from(match[2], 'base64')) }
}

const isConflict = (err: unknown) => isDontCodeError(err) && err.status === 409

/**
 * Publish or update a user's map.
 *
 * Maps are now mutable, user-owned rows keyed by an opaque `public_id` (a nanoid
 * the rest of the app addresses maps by). The full serialized board rides inline
 * in `map_data` rather than a content-addressed `.txt` in object storage, so the
 * play/editor pages load a map in a single row read.
 *
 *  - No `id` in the body → create a new map. Subject to the per-user quota.
 *  - `id` of a map this user owns → update it in place (edit a typo, re-snapshot
 *    the thumbnail) while keeping the same shareable link.
 *
 * Returns `{ id }` — the map's `public_id` — either way.
 */
export const POST = async ({ request, locals }) => {
	const owner = locals.user
	if (!owner) throw error(401, { message: 'Sign in to publish a map.' })

	const { id, name, encoded, thumbnail } = await request.json()

	if (!encoded || typeof encoded !== 'string') {
		throw error(400, { message: 'No map to upload.' })
	}

	// A published map must carry a thumbnail (the /make listing renders it), so a
	// missing/oversized/garbage snapshot is a 400 rather than an empty column.
	if (typeof thumbnail !== 'string' || thumbnail.length > MAX_THUMBNAIL_CHARS) {
		throw error(400, { message: 'A map preview is required to publish.' })
	}
	const parsedThumbnail = parseDataUrl(thumbnail)
	if (!parsedThumbnail) {
		throw error(400, { message: 'A map preview is required to publish.' })
	}

	const mapName = typeof name === 'string' && name.trim() ? name.trim() : 'Untitled map'

	// ── Update in place ──────────────────────────────────────────────────────
	// Re-saving an existing map the caller owns updates the row and keeps its link.
	if (typeof id === 'string' && id) {
		const existing = await db.findOne<{
			public_id: string
			owner_auth: string
			map_data: string
		}>('maps', {
			where: { public_id: id },
			select: ['public_id', 'owner_auth', 'map_data'],
		})
		if (!existing) throw error(404, { message: 'That map no longer exists.' })
		if (existing.owner_auth !== owner) {
			throw error(403, { message: 'You can only edit maps you own.' })
		}

		// Never let a save replace a real board with bare terrain. This is the last
		// line of defence behind the editor bug that let a stale in-memory board adopt
		// another map's id (see `canResumeInMemoryMap`): the save looked normal, the
		// canvas showed the right map, and the row was wiped with no way back.
		if (wouldWipeBoard(encoded, existing.map_data)) {
			throw error(409, {
				message:
					'This save has no units or buildings, but the saved map does. Reload the editor and check the board before saving again.',
			})
		}

		const { url: thumbnailUrl } = await storage.uploadPublic(
			`maps/${id}.png`,
			parsedThumbnail.bytes,
			parsedThumbnail.contentType
		)

		try {
			await db.update(
				'maps',
				{ public_id: id },
				{
					name: mapName,
					map_data: encoded,
					thumbnail: thumbnailUrl,
					updated_at: new Date().toISOString(),
				}
			)
		} catch (msg) {
			await logToErrorDb(msg)
			throw error(500, { message: 'Could not save map to database' })
		}
		return json({ id })
	}

	// ── Create new ───────────────────────────────────────────────────────────
	const owned = await db.count('maps', { owner_auth: owner })
	if (owned >= MAX_MAPS_PER_USER) {
		throw error(403, {
			message: `You've reached the limit of ${MAX_MAPS_PER_USER} maps. Delete one to publish another.`,
		})
	}

	// Mint a fresh public_id and insert; on the rare unique collision, try again.
	for (let attempt = 0; attempt < ID_RETRIES; attempt++) {
		const publicId = generateMapId()

		const { url: thumbnailUrl } = await storage.uploadPublic(
			`maps/${publicId}.png`,
			parsedThumbnail.bytes,
			parsedThumbnail.contentType
		)

		try {
			await db.insert('maps', {
				public_id: publicId,
				owner_auth: owner,
				name: mapName,
				description: '',
				thumbnail: thumbnailUrl,
				map_data: encoded,
				status: 'public',
			})
			return json({ id: publicId })
		} catch (msg) {
			if (isConflict(msg)) continue // public_id clash — remint and retry.
			await logToErrorDb(msg)
			throw error(500, { message: 'Could not save map to database' })
		}
	}

	throw error(500, { message: 'Could not allocate a map id. Please try again.' })
}
