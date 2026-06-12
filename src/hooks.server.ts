import { error, redirect, type Handle, type RequestEvent } from '@sveltejs/kit'
import { createClient } from '@vercel/kv'
import { KV_REST_API_TOKEN, KV_REST_API_URL } from '$env/static/private'
import { dev } from '$app/environment'
import { auth } from '$lib/dontcode/server'
import { generateKey } from '$lib/Security/keys'

export const handle: Handle = async ({ event, resolve }) => {
	const protectedRoutes = [
		'/onboarding',
		'/me',
		'/play',
		'/make',
		'/rooms',
		'/api/game',
		'/api/user',
		'/api/upload',
		'/api/migrations',
	]

	// Resolve the signed-in user once per request from the access_token cookie.
	const accessToken = event.cookies.get('access_token')
	if (accessToken) {
		const user = await resolveUser(accessToken)
		if (user) {
			event.locals.user = user.id
			event.locals.userEmail = user.email
		}
	}

	if (protectedRoutes.some((url) => event.url.pathname.startsWith(url))) {
		if (!event.locals.user) {
			throw redirect(303, '/login')
		}

		event.locals.session = await getUserSession(event)
	}

	return await resolve(event)
}

const resolveUser = async (accessToken: string) => {
	try {
		return await auth.me(accessToken)
	} catch {
		// Platform hiccups read as "not signed in" instead of crashing the request.
		return null
	}
}

const getUserSession = async (event: RequestEvent) => {
	if (dev) {
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
		console.error(msg)
		throw error(500, 'Cannot get from Redis storage')
	}

	if (!session) {
		session = generateKey()
		const fullDay = 60 * 60 * 24
		try {
			await kv.set(`user:${userId}`, session, { ex: fullDay, nx: true })
		} catch (msg) {
			console.error(msg)
			throw error(500, 'Cannot set to Redis storage')
		}
	}

	return session
}
