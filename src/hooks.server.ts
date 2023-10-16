import { type RequestEvent, redirect, type Handle } from '@sveltejs/kit'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { PUBLIC_HANKO_API_URL } from '$env/static/public'

const authenticatedUser = async (event: RequestEvent) => {
	const { cookies } = event
	const hanko = cookies.get('hanko')
	console.error('CASH', `${PUBLIC_HANKO_API_URL}/.well-known/jwks.json`)
	const JWKS = createRemoteJWKSet(new URL(`${PUBLIC_HANKO_API_URL}/.well-known/jwks.json`))

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
