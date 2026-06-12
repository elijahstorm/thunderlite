import { dev } from '$app/environment'
import type { Cookies } from '@sveltejs/kit'

export const ACCESS_TOKEN_COOKIE = 'access_token'

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
