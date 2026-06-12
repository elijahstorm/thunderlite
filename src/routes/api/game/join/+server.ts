import { error, json } from '@sveltejs/kit'
import { KV_REST_API_TOKEN, KV_REST_API_URL } from '$env/static/private'
import { createClient } from '@vercel/kv'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

const MAX_PLAYERS = 2
const SESSION_TTL_SECONDS = 60 * 60 * 24

export const POST = async ({ request, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const { session } = await request.json()
	if (!session || typeof session !== 'string') {
		throw error(400, 'Please provide a session code')
	}

	const kv = createClient({
		url: KV_REST_API_URL,
		token: KV_REST_API_TOKEN,
	})

	try {
		const members = (await kv.smembers(`game:${session}`)) as string[] | null
		if (!members || members.length === 0) {
			throw error(404, 'Game session does not exist')
		}

		if (members.includes(userSession)) {
			const existing = (await kv.hgetall(`user-game:${members[0]}`)) as unknown as {
				session: string
				sha: string
			} | null
			if (!existing?.sha) throw error(500, 'Game session is missing map data')
			await kv.hset(`user-game:${userSession}`, {
				session,
				sha: existing.sha,
				expires: new Date().getTime() + SESSION_TTL_SECONDS * 1000,
			})
			return json({ session, sha: existing.sha })
		}

		if (members.length >= MAX_PLAYERS) {
			throw error(409, 'Game session is full')
		}

		const creatorData = (await kv.hgetall(`user-game:${members[0]}`)) as unknown as {
			session: string
			sha: string
		} | null
		if (!creatorData?.sha) {
			throw error(500, 'Game session is missing map data')
		}

		await kv.hset(`user-game:${userSession}`, {
			session,
			sha: creatorData.sha,
			expires: new Date().getTime() + SESSION_TTL_SECONDS * 1000,
		})
		await kv.sadd(`game:${session}`, userSession)

		return json({ session, sha: creatorData.sha })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Cannot get from Redis storage')
	}
}
