import { error, json } from '@sveltejs/kit'
import { BLOB_READ_WRITE_TOKEN, POSTGRES_URL } from '$env/static/private'
import { createPool } from '@vercel/postgres'
import { hash } from '$lib/Map/Editor/mapEncrypter.js'
import { put } from '@vercel/blob'
import { logToErrorDb } from '$lib/Security/server-logs.js'

export const POST = async ({ request }) => {
	const { name, encoded } = await request.json()

	if (!encoded) {
		throw error(400, { message: 'No map to upload.' })
	}

	const { url } = await put(name, encoded, {
		access: 'public',
		token: BLOB_READ_WRITE_TOKEN,
	})

	const sha = await new Promise((resolve) => hash(url)(resolve))

	try {
		const pool = createPool({ connectionString: POSTGRES_URL })
		await pool.query(`INSERT INTO Maps (sha, url) VALUES ('${sha}', '${url}')`)
	} catch (msg) {
		logToErrorDb(createPool({ connectionString: POSTGRES_URL }))(msg)
		throw error(500, 'Could not save map to database')
	}

	return json({ sha })
}
