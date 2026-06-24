import { redirect, type Handle, type RequestEvent } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { auth } from '$lib/dontcode/server'
import { resolveCachedUser } from '$lib/dontcode/sessionCache'

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
	]

	// Resolve the signed-in user once per request from the access_token cookie.
	// Cached per token (see sessionCache) so repeat requests within the TTL skip
	// the remote auth.me() round-trip, and so a transient backend failure keeps
	// the user signed in on last-known state instead of bouncing them to /login.
	const accessToken = event.cookies.get('access_token')
	if (accessToken) {
		const user = await resolveCachedUser(accessToken, resolveUser)
		if (user) {
			event.locals.user = user.id
			event.locals.userEmail = user.email ?? undefined
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

// `auth.me` returns null only for a real 401 (definitively signed out) and
// throws on transient platform failures. We deliberately let those throw so the
// cache can serve last-known state instead of misreading a hiccup as signed-out.
const resolveUser = (accessToken: string) => auth.me(accessToken)

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
