import { type RequestEvent, redirect, type Handle } from '@sveltejs/kit'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { PUBLIC_HANKO_API_URL } from '$env/static/public'

const authenticatedUser = async (event: RequestEvent) => {
	const { cookies } = event
	const hanko = cookies.get('hanko')
	const JWKS = createRemoteJWKSet(
		new URL(`${'https://512eead1-52c4-4016-a1f5-6015f26df6c0.hanko.io'}/.well-known/jwks.json`)
	)

	try {
		await jwtVerify(hanko ?? '', JWKS)
		return true
	} catch {
		return false
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const verified = await authenticatedUser(event)

	if (event.url.pathname.startsWith('/me') && !verified) {
		throw redirect(303, '/login')
	}

	const response = await resolve(event)
	return response
}
