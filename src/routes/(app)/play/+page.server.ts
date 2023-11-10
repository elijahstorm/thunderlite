import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { createClient } from '@vercel/kv'
import { KV_REST_API_TOKEN, KV_REST_API_URL, VERCEL_ENV } from '$env/static/private'
import { logToErrorDb } from '$lib/Security/server-logs.js'
import { getMapHash } from '$lib/Map/hashLoader'
import type postgres from 'postgres'

export const load: PageServerLoad = async ({ locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const { gameSession, sha } = await getGameSession(locals.sql, userSession)
	if (!gameSession || !sha) throw error(403, 'No game session found')

	return {
		userSession,
		gameSession,
		...(await getMapHash(locals.sql, sha)),
	}
}

const getGameSession = async (sql: postgres.Sql, userSession: string) => {
	if (VERCEL_ENV !== 'production') {
		return { gameSession: 'testSession', sha: 'hello' }
	}

	const kv = createClient({
		url: KV_REST_API_URL,
		token: KV_REST_API_TOKEN,
	})
	let isMember = false
	let gameSession: string | null = null
	let sha: string | null = null

	try {
		const gameData = (await kv.hgetall(`user-game:${userSession}`)) as unknown as {
			session: string
			sha: string
		} | null
		if (!gameData) return {}
		gameSession = gameData.session
		sha = gameData.sha
		isMember =
			gameSession !== null && (await kv.sismember(`game:${gameSession}`, userSession)) === 1
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Cannot get from Redis storage')
	}

	if (!isMember) {
		throw error(403, 'You are not a member of this game room')
	}

	return { gameSession, sha }
}
