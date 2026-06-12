import { error, json } from '@sveltejs/kit'
import { hash } from '$lib/Map/Editor/mapEncrypter.js'
import { db, storage } from '$lib/Server/dontcode'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

export const POST = async ({ request }) => {
	const { name, encoded } = await request.json()

	if (!encoded) {
		throw error(400, { message: 'No map to upload.' })
	}

	const { url } = await storage.uploadPublic(
		name,
		new Blob([encoded], { type: 'text/plain' }),
		'text/plain'
	)

	const sha = await new Promise<string>((resolve) => hash(url)(resolve))

	try {
		await db.insert('maps', { sha, url })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not save map to database')
	}

	return json({ sha })
}
