import { redirect, type Handle, type RequestEvent } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { auth } from '$lib/dontcode/server'

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

/**
 * The player's opaque game identity (`userSession`), used as their handle in
 * online (H2) game rooms. It must be stable per user and server-derived (so a
 * client can't spoof another player) — but it is not a secret, so we derive it
 * deterministically from the signed-in user id instead of storing a random key.
 *
 * This used to round-trip Vercel KV on every protected route; that instance is
 * gone, and a KV/network hiccup here would 500 the request and bounce a
 * logged-in user to /login. Deriving it in-process removes that failure mode
 * entirely. HMAC-SHA256 (keyed by the project API key, via the Web Crypto API
 * the rest of the app already uses) keeps the value opaque and decoupled from
 * the raw auth id.
 */
const getUserSession = async (event: RequestEvent): Promise<string> => {
	const userId = event.locals.user ?? ''
	const secret = env.DONTCODE_API_KEY ?? 'thunderlite-fallback-secret'
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	)
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId))
	return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
