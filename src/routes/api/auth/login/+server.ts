import { json, type RequestHandler } from '@sveltejs/kit'
import { auth } from '$lib/Server/dontcode'
import { readCredentials, setAccessTokenCookie } from '../utils'

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { email, password } = await readCredentials(request)
	if (!email || !password) {
		return json({ success: false, error: 'Email and password are required' }, { status: 400 })
	}

	const result = await auth.login(email, password)
	if (!result.success || !result.tokens) {
		return json(
			{ success: false, error: result.error ?? 'Invalid email or password' },
			{ status: 401 }
		)
	}

	setAccessTokenCookie(cookies, result.tokens.AccessToken, result.tokens.ExpiresIn)

	return json({ success: true })
}
