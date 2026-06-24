import { error, json } from '@sveltejs/kit'
import { hash } from '$lib/Map/Editor/mapEncrypter.js'
import { db, storage } from '$lib/dontcode/server'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

// Generous cap on the inbound thumbnail data URL (~3MB of base64). A PNG of a
// pixel-art board is far smaller; this just bounds an abusive/garbage payload.
const MAX_THUMBNAIL_CHARS = 3_000_000

/** Decode a `data:<type>;base64,<data>` URL into bytes for storage upload. */
const parseDataUrl = (dataUrl: string): { contentType: string; bytes: Uint8Array } | null => {
	const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl)
	if (!match) return null
	return { contentType: match[1], bytes: new Uint8Array(Buffer.from(match[2], 'base64')) }
}

export const POST = async ({ request, locals }) => {
	const { name, encoded, thumbnail } = await request.json()

	if (!encoded) {
		throw error(400, { message: 'No map to upload.' })
	}

	// Content-addressed: the sha is derived from the map data itself, not its
	// storage URL. Identical maps therefore dedupe to one row, and two distinct
	// maps never collide — which the old title-keyed scheme allowed, since map
	// titles aren't unique (the default is "Unnamed Map").
	const sha = await new Promise<string>((resolve) => hash(encoded)(resolve))

	// Re-sharing the same map is idempotent: if this exact content is already
	// published, hand back its existing link instead of failing the unique-sha
	// constraint (which previously surfaced as a confusing 500 → /editor/undefined).
	const existing = await db.findOne<{ sha: string }>('maps', { where: { sha }, select: ['sha'] })
	if (existing) {
		return json({ sha })
	}

	const { url } = await storage.uploadPublic(
		`maps/${sha}.txt`,
		new Blob([encoded], { type: 'text/plain' }),
		'text/plain'
	)

	// A published map must carry a thumbnail (the /make listing renders it), so a
	// missing/oversized/garbage snapshot is a 400 rather than an empty column. The
	// editor blocks the share until it can produce one, so this is the boundary guard.
	if (typeof thumbnail !== 'string' || thumbnail.length > MAX_THUMBNAIL_CHARS) {
		throw error(400, { message: 'A map preview is required to publish.' })
	}
	const parsedThumbnail = parseDataUrl(thumbnail)
	if (!parsedThumbnail) {
		throw error(400, { message: 'A map preview is required to publish.' })
	}
	// Board snapshot → public storage, keyed by the same content sha so it rides
	// alongside the map blob.
	const { url: thumbnailUrl } = await storage.uploadPublic(
		`maps/${sha}.png`,
		parsedThumbnail.bytes,
		parsedThumbnail.contentType
	)

	try {
		// The `maps` row carries the metadata the community browser (/make) needs;
		// name/description/thumbnail are NOT NULL, so a partial insert would fail.
		// insertIgnoreConflict absorbs the race where a concurrent identical share
		// inserted the same sha between our findOne and here.
		await db.insertIgnoreConflict('maps', {
			sha,
			owner_auth: locals.user,
			name: typeof name === 'string' && name.trim() ? name.trim() : 'Untitled map',
			description: '',
			thumbnail: thumbnailUrl,
			url,
			status: 'public',
		})
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not save map to database')
	}

	return json({ sha })
}
