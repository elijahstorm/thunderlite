import type { RequestEvent } from '@sveltejs/kit'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { VERCEL_ENV } from '$env/static/private'
import { PUBLIC_HANKO_API_URL } from '$env/static/public'

export const authenticatedUser = async (event: RequestEvent) => {
	if (VERCEL_ENV !== 'production') {
		return true
	}

	const { cookies } = event
	const hanko = cookies.get('hanko')

	try {
		await jwtVerify(
			hanko ?? '',
			createRemoteJWKSet(new URL(`${PUBLIC_HANKO_API_URL}/.well-known/jwks.json`))
		)

		return true
	} catch {
		return false
	}
}
