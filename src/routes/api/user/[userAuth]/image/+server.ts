import { error, json } from '@sveltejs/kit'
import { db, storage } from '$lib/Server/dontcode'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { generateKey } from '$lib/Security/keys.js'

export const POST = async ({ params, request }) => {
	const blob = await request.blob()
	const { userAuth } = params

	if (!blob) {
		throw error(400, { message: 'No image to upload.' })
	}

	const { url } = await storage.uploadPublic(
		`user-images/${generateKey()}`,
		blob,
		blob.type || 'application/octet-stream'
	)

	try {
		await db.update('profiles', { auth: userAuth }, { profile_image_url: url })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not save image url to database')
	}

	return json({ url })
}
