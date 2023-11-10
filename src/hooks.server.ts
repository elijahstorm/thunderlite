import { error, redirect, type Handle, type RequestEvent } from '@sveltejs/kit'
import { createClient } from '@vercel/kv'
import { KV_REST_API_TOKEN, KV_REST_API_URL, POSTGRES_URL, VERCEL_ENV } from '$env/static/private'
import { authenticatedUser } from '$lib/Components/Auth/hanko-server'
import { generateKey } from '$lib/Security/keys'
import { logToErrorDb } from '$lib/Security/server-logs'
import postgres from 'postgres'

export const handle: Handle = async ({ event, resolve }) => {
	let sql: postgres.Sql | null = null
	const protectedRoutes = ['/me', '/play', '/make', '/api/game', '/api/user', '/api/upload']
	if (protectedRoutes.some((url) => event.url.pathname.startsWith(url))) {
		if (!(await authenticatedUser(event))) {
			throw redirect(303, '/login')
		}

		sql = postgres(POSTGRES_URL, { idle_timeout: 60 * 5, max_lifetime: 60 * 30 })
		event.locals.session = await getUserSession(sql, event)
	}

	event.locals.sql = sql ?? postgres(POSTGRES_URL, { idle_timeout: 20, max_lifetime: 60 * 10 })

	return await resolve(event)
}

const getUserSession = async (sql: postgres.Sql, event: RequestEvent) => {
	if (VERCEL_ENV !== 'production') {
		return generateKey()
	}

	const userId = event.locals.user
	if (!userId) {
		throw error(500, 'User ID not set')
	}

	const kv = createClient({
		url: KV_REST_API_URL,
		token: KV_REST_API_TOKEN,
	})
	let session: string | null
	try {
		session = await kv.get(`user:${userId}`)
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Cannot get from Redis storage')
	}

	if (!session) {
		session = generateKey()
		const fullDay = 60 * 60 * 24
		try {
			await kv.set(`user:${userId}`, session, { ex: fullDay, nx: true })
		} catch (msg) {
			logToErrorDb(sql)(msg)
			throw error(500, 'Cannot set to Redis storage')
		}
	}

	return session
}
