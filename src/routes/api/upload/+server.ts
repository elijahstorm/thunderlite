import { error, json } from '@sveltejs/kit'
import { BLOB_READ_WRITE_TOKEN } from '$env/static/private'
import { hash } from '$lib/Map/Editor/mapEncrypter.js'
import { put } from '@vercel/blob'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

export const POST = async ({ request, locals }) => {
	const { name, encoded } = await request.json()

	if (!encoded) {
		error(400, { message: 'No map to upload.' });
	}

	const { url } = await put(name, encoded, {
		access: 'public',
		token: BLOB_READ_WRITE_TOKEN,
	})

	const sha = await new Promise<string>((resolve) => hash(url)(resolve))

	try {
		await locals.sql`insert into maps (sha, url) values (${sha}, ${url})`
	} catch (msg) {
		logToErrorDb(locals.sql)(msg)
		error(500, 'Could not save map to database');
	}

	return json({ sha })
}
