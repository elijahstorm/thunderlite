import type { RequestEvent } from '@sveltejs/kit'
import { jwtVerify, createRemoteJWKSet, decodeJwt } from 'jose'
import { PUBLIC_HANKO_API_URL } from '$env/static/public'
import { env } from '$env/dynamic/private'

// In docker-compose the browser hits Hanko at PUBLIC_HANKO_API_URL (e.g.
// http://localhost:8000), but inside the app container "localhost" is the app
// itself — Hanko is reachable as http://hanko:8000 over the docker network.
// HANKO_API_URL_INTERNAL lets the server use the network-internal URL when set.
const serverHankoUrl = env.HANKO_API_URL_INTERNAL || PUBLIC_HANKO_API_URL

export const authenticatedUser = async (event: RequestEvent) => {
	const hanko = event.cookies.get('hanko')
	try {
		await jwtVerify(
			hanko ?? '',
			createRemoteJWKSet(new URL(`${serverHankoUrl}/.well-known/jwks.json`))
		)
		event.locals.user = decodeJwt(hanko ?? '').sub
		return true
	} catch {
		return false
	}
}

export const activeUserInfo = async (auth: string) => {
	const response = await fetch(`${serverHankoUrl}/users/${auth}`)
	const data = await response.json()

	const email = data.emails ? data.emails[0]?.address : null

	return {
		email,
	}
}
