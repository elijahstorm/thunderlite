import { json, type RequestHandler } from '@sveltejs/kit'
import { auth } from '$lib/dontcode/server'
import {
	readCredentials,
	setAccessTokenCookie,
	setMfaChallengeCookie,
} from '$lib/dontcode/cookies'

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { email, password } = await readCredentials(request)
	if (!email || !password) {
		return json({ success: false, error: 'Email and password are required' }, { status: 400 })
	}

	const result = await auth.login(email, password)

	// Account exists but the email hasn't been confirmed yet — send the user to
	// the verification step instead of showing a generic failure.
	if (result.code === 'EmailNotVerified') {
		return json(
			{
				success: false,
				verificationRequired: true,
				error: result.error ?? 'Please verify your email before signing in',
			},
			{ status: 403 }
		)
	}

	// A second factor is required. Stash the challenge token and ask the client
	// for the authenticator code.
	if (result.success && result.mfa_required && result.challenge_token) {
		setMfaChallengeCookie(cookies, result.challenge_token, result.challenge_expires_in ?? 300)
		return json({ success: true, mfaRequired: true })
	}

	if (!result.success || !result.tokens) {
		return json(
			{ success: false, error: result.error ?? 'Invalid email or password' },
			{ status: 401 }
		)
	}

	setAccessTokenCookie(cookies, result.tokens.AccessToken, result.tokens.ExpiresIn)

	return json({ success: true })
}
