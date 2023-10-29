import { error, json } from '@sveltejs/kit'
import { KV_REST_API_TOKEN, KV_REST_API_URL, POSTGRES_URL } from '$env/static/private'
import { createPool } from '@vercel/postgres'
import { createClient } from '@vercel/kv'
import { generateKey } from '$lib/Security/keys.js'
import { logToErrorDb } from '$lib/Security/server-logs.js'
import { isValidMapHash } from '$lib/Map/hashLoader.js'

export const POST = async ({ request, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const { sha } = await request.json()
	if (!sha) throw error(400, 'Please provide a map SHA')
	if (!(await isValidMapHash(sha))) throw error(400, 'Map with that SHA does not exist')

	const kv = createClient({
		url: KV_REST_API_URL,
		token: KV_REST_API_TOKEN,
	})
	const session = generateKey()
	const fullDay = 60 * 60 * 24

	try {
		await kv.hset(`user-game:${userSession}`, {
			session,
			sha,
			expires: new Date().getTime() + fullDay,
		})
		await kv.sadd(`game:${session}`, userSession)
	} catch (msg) {
		logToErrorDb(createPool({ connectionString: POSTGRES_URL }))(msg)
		throw error(500, 'Cannot get from Redis storage')
	}

	return json({ session })
}
