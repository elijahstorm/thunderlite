import { error } from '@sveltejs/kit'
import { KV_REST_API_TOKEN, KV_REST_API_URL, POSTGRES_URL } from '$env/static/private'
import { createClient } from '@vercel/kv'
import { createPool } from '@vercel/postgres'
import { logToErrorDb } from '$lib/Security/server-logs.js'

export async function load({ locals }) {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const gameSession = await getGameSession(userSession)
	if (!gameSession) throw error(403, 'No game session found')

	try {
		// generateKey()
		// await kv.sadd(`game:${gameSession}`, userSession)
	} catch (error) {
		// Handle errors
	}
	try {
		// await kv.srem(`game:${gameSession}`, 'mem1', 'mem2')
	} catch (error) {
		// Handle errors
	}

	return {
		userSession,
		gameSession,
	}
}

const getGameSession = async (userSession: string) => {
	const kv = createClient({
		url: KV_REST_API_URL,
		token: KV_REST_API_TOKEN,
	})
	let isMember = false
	let session: string | null

	try {
		session = await kv.get(`user-game:${userSession}`)
		isMember = (await kv.sismember(`game:${session}`, userSession)) === 1
	} catch (msg) {
		logToErrorDb(createPool({ connectionString: POSTGRES_URL }))(msg)
		throw error(500, 'Cannot get from Redis storage')
	}

	if (!isMember) {
		throw error(403, 'You are not a member of this game room')
	}

	return session
}
