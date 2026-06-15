import { json, type RequestHandler } from '@sveltejs/kit'
import { auth } from '$lib/dontcode/server'
import {
	MFA_CHALLENGE_COOKIE,
	clearMfaChallengeCookie,
	readJsonBody,
	setAccessTokenCookie,
} from '$lib/dontcode/cookies'

/**
 * Second step of an MFA login: trade the challenge token (set as an httpOnly
 * cookie by the login route) plus the user's authenticator/recovery code for an
 * access token.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const challengeToken = cookies.get(MFA_CHALLENGE_COOKIE)
	if (!challengeToken) {
		return json(
			{ success: false, expired: true, error: 'Your sign-in session expired. Please sign in again.' },
			{ status: 401 }
		)
	}

	const body = await readJsonBody(request)
	const code = typeof body.code === 'string' ? body.code.trim() : ''
	const recoveryCode = typeof body.recoveryCode === 'string' ? body.recoveryCode.trim() : ''
	if (!code && !recoveryCode) {
		return json({ success: false, error: 'Enter your authentication code' }, { status: 400 })
	}

	const result = await auth.mfaChallenge(challengeToken, {
		code: code || undefined,
		recoveryCode: recoveryCode || undefined,
	})
	if (!result.success || !result.tokens) {
		if (result.code === 'ChallengeExpired') {
			clearMfaChallengeCookie(cookies)
			return json(
				{
					success: false,
					expired: true,
					error: 'Your sign-in session expired. Please sign in again.',
				},
				{ status: 401 }
			)
		}
		return json(
			{ success: false, error: result.error ?? 'That code is invalid' },
			{ status: 401 }
		)
	}

	setAccessTokenCookie(cookies, result.tokens.AccessToken, result.tokens.ExpiresIn)
	clearMfaChallengeCookie(cookies)
	return json({ success: true })
}
