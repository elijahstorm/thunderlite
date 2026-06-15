import { json, type RequestHandler } from '@sveltejs/kit'
import { auth } from '$lib/dontcode/server'
import { readCredentials, setAccessTokenCookie } from '$lib/dontcode/cookies'

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { email, password } = await readCredentials(request)
	if (!email || !password) {
		return json({ success: false, error: 'Email and password are required' }, { status: 400 })
	}

	const signup = await auth.signup(email, password)
	if (!signup.success) {
		return json(
			{ success: false, error: signup.error ?? 'Could not create your account' },
			{ status: 400 }
		)
	}

	// When email verification is on, there's no point trying to sign in — the
	// account is locked until the user enters the code we just emailed them.
	if (signup.verification_required) {
		return json({ success: true, loggedIn: false, verification_required: true })
	}

	// Otherwise sign the new account in right away so the user lands in the app.
	const login = await auth.login(email, password)
	const loggedIn = !!(login.success && login.tokens)
	if (login.success && login.tokens) {
		setAccessTokenCookie(cookies, login.tokens.AccessToken, login.tokens.ExpiresIn)
	}

	return json({ success: true, loggedIn, verification_required: false })
}
