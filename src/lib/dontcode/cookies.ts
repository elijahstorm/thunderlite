import { dev } from '$app/environment'
import type { Cookies } from '@sveltejs/kit'

export const ACCESS_TOKEN_COOKIE = 'access_token'

/**
 * Short-lived MFA challenge token, set when `login` returns `mfa_required` and
 * consumed by the `mfa/challenge` step. Kept httpOnly so it never reaches JS,
 * exactly like the access token.
 */
export const MFA_CHALLENGE_COOKIE = 'mfa_challenge'

export const setAccessTokenCookie = (cookies: Cookies, token: string, expiresIn: number) => {
	cookies.set(ACCESS_TOKEN_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: expiresIn,
	})
}

export const clearAccessTokenCookie = (cookies: Cookies) => {
	cookies.delete(ACCESS_TOKEN_COOKIE, { path: '/' })
}

export const setMfaChallengeCookie = (cookies: Cookies, token: string, expiresIn: number) => {
	cookies.set(MFA_CHALLENGE_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: expiresIn,
	})
}

export const clearMfaChallengeCookie = (cookies: Cookies) => {
	cookies.delete(MFA_CHALLENGE_COOKIE, { path: '/' })
}

export const readCredentials = async (request: Request) => {
	try {
		const body = await request.json()
		return {
			email: typeof body?.email === 'string' ? body.email.trim() : '',
			password: typeof body?.password === 'string' ? body.password : '',
		}
	} catch {
		return { email: '', password: '' }
	}
}

export const readJsonBody = async (request: Request): Promise<Record<string, unknown>> => {
	try {
		const body = await request.json()
		return body && typeof body === 'object' ? body : {}
	} catch {
		return {}
	}
}
