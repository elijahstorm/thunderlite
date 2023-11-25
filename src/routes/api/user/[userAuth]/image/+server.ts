import { error, json } from '@sveltejs/kit'
import { put } from '@vercel/blob'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { BLOB_READ_WRITE_TOKEN } from '$env/static/private'
import { generateKey } from '$lib/Security/keys.js'

export const POST = async ({ params, request, locals }) => {
	const blob = await request.blob()
	const { userAuth } = params

	if (!blob) {
		throw error(400, { message: 'No image to upload.' })
	}

	const { url } = await put(`/user-images/${generateKey()}`, blob, {
		access: 'public',
		token: BLOB_READ_WRITE_TOKEN,
	})

	try {
		await locals.sql`update users set profile_image_url = ${url} where auth = ${userAuth}`
	} catch (msg) {
		logToErrorDb(locals.sql)(msg)
		throw error(500, 'Could not save image url to database')
	}

	return json({ url })
}
