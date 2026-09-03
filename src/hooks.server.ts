import { redirect, type Handle, type RequestEvent } from '@sveltejs/kit'
import { building, dev } from '$app/environment'
import { env } from '$env/dynamic/private'
import { auth } from '$lib/dontcode/server'
import { resolveCachedUser } from '$lib/dontcode/sessionCache'
import { requestSpend, withRequestSpend } from '$lib/Security/gatewayLedger'
import { playerFacingCooldownSeconds } from '$lib/Security/rateLimit'
import { SERVICE_BUSY_HEADER } from '$lib/Security/serviceBusy'

/**
 * Wrapped in `withRequestSpend` so every gateway call this request makes — at
 * any depth, including the store helpers that have no idea a request exists —
 * is attributed to the route that caused it. The route then reports its own cost
 * back on the response (`x-gateway-calls`), which is what makes the sync path's
 * call amplification measurable from the client rather than inferred.
 */
export const handle: Handle = (input) =>
	withRequestSpend(input.event.route.id ?? input.event.url.pathname, () => handleRequest(input))

const handleRequest: Handle = async ({ event, resolve }) => {
	const protectedRoutes = [
		'/onboarding',
		'/me',
		'/play',
		'/make',
		'/rooms',
		'/chat',
		'/api/game',
		'/api/realtime',
		'/api/chat',
		'/api/user',
		'/api/upload',
		'/api/pro',
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

	// Dev only: the server stress test (`/dev/server-stress-test`) drives the
	// game routes as many virtual players from inside this same process, and
	// those players have no account to sign in with. A `stress-` prefixed header
	// stands in for the cookie so the request flows through the exact code a real
	// client's would, session derivation included. Never honoured outside dev.
	if (dev && !event.locals.user) {
		const stressUser = event.request.headers.get('x-stress-user')
		if (stressUser && stressUser.startsWith('stress-')) event.locals.user = stressUser
	}

	// Skip the auth/redirect dance while prerendering: there's no real request
	// here, accessing `url.search` throws, and the protected pages themselves
	// are `prerender = false` so nothing reaches the client anyway.
	if (!building && protectedRoutes.some((url) => event.url.pathname.startsWith(url))) {
		if (!event.locals.user) {
			// Preserve where they were headed (path + query) so /login can send
			// them back after authenticating. API routes are fetched, not
			// navigated, so bouncing back to one is meaningless — skip those.
			const { pathname, search } = event.url
			const returnTo = pathname.startsWith('/api/') ? '' : pathname + search
			const query = returnTo ? `?redirectTo=${encodeURIComponent(returnTo)}` : ''
			throw redirect(303, `/login${query}`)
		}

		event.locals.session = await getUserSession(event)
	}

	const response = await resolve(event)

	// Tell the client what we know about the gateway's rate limits. Any request
	// carries the news, so the countdown in the UI starts from whatever the page
	// happened to be doing rather than needing a poll of its own — and it stops
	// on its own when responses come back without the header.
	//
	// Only budgets a player could notice are announced (see PLAYER_FACING): the
	// gateway meters each namespace separately, and a full email queue is not a
	// reason to tell someone mid-match that the servers are busy.
	const busyFor = playerFacingCooldownSeconds()
	if (busyFor > 0) response.headers.set(SERVICE_BUSY_HEADER, `${busyFor}`)

	// What this request cost in gateway calls, so the client can record it next
	// to the latency it measured. A move that took two seconds because it made
	// eight calls and a move that took two seconds because the gateway was slow
	// are different bugs, and only this header tells them apart. Diagnostics for
	// our own clients, not a contract — nothing depends on it being present.
	const spend = requestSpend()
	if (spend && spend.calls > 0) {
		response.headers.set('x-gateway-calls', `${spend.calls}`)
		response.headers.set('x-gateway-ms', `${spend.ms}`)
		response.headers.append('server-timing', `gateway;dur=${spend.ms};desc="${spend.calls} calls"`)
	}

	return response
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
