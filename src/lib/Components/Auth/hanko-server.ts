import type { RequestEvent } from '@sveltejs/kit'
import { jwtVerify, createRemoteJWKSet, decodeJwt } from 'jose'
import { PUBLIC_HANKO_API_URL } from '$env/static/public'
import { VERCEL_ENV } from '$env/static/private'

export const authenticatedUser = async (event: RequestEvent) => {
	if (VERCEL_ENV !== 'production') {
		event.locals.user = 'local'
		return true
	}

	const hanko = event.cookies.get('hanko')
	try {
		await jwtVerify(
			hanko ?? '',
			createRemoteJWKSet(new URL(`${PUBLIC_HANKO_API_URL}/.well-known/jwks.json`))
		)
		event.locals.user = decodeJwt(hanko ?? '').sub
		return true
	} catch {
		return false
	}
}
