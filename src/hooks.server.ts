import { error, redirect, type Handle, type RequestEvent } from '@sveltejs/kit'
import { createClient } from '@vercel/kv'
import { createPool } from '@vercel/postgres'
import { KV_REST_API_TOKEN, KV_REST_API_URL, POSTGRES_URL } from '$env/static/private'
import { authenticatedUser } from '$lib/Components/Auth/hanko-server'
import { generateKey } from '$lib/Security/keys'
import { logToErrorDb } from '$lib/Security/server-logs'

export const handle: Handle = async ({ event, resolve }) => {
	const protectedRoutes = ['/me', '/test']
	if (protectedRoutes.some((url) => event.url.pathname.startsWith(url))) {
		if (!(await authenticatedUser(event))) {
			throw redirect(303, '/login')
		}

		event.locals.session = await getUserSession(event)
	}

	return await resolve(event)
}

const getUserSession = async (event: RequestEvent) => {
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
		logToErrorDb(createPool({ connectionString: POSTGRES_URL }))(msg)
		throw error(500, 'Cannot get from Redis storage')
	}

	if (!session) {
		session = generateKey()
		const fullDay = 60 * 60 * 24
		try {
			await kv.set(`user:${userId}`, session, { ex: fullDay, nx: true })
		} catch (msg) {
			logToErrorDb(createPool({ connectionString: POSTGRES_URL }))(msg)
			throw error(500, 'Cannot set to Redis storage')
		}
	}

	return session
}
