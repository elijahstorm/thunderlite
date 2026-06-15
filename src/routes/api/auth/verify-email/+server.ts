import { json, type RequestHandler } from '@sveltejs/kit'
import { auth } from '$lib/dontcode/server'
import { readJsonBody } from '$lib/dontcode/cookies'

/** Confirm a new account with the 6-digit code emailed during signup. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await readJsonBody(request)
	const code = typeof body.code === 'string' ? body.code.trim() : ''
	if (!code) {
		return json({ success: false, error: 'Enter the code from your email' }, { status: 400 })
	}

	const result = await auth.verifyEmail(code)
	if (!result.success) {
		return json(
			{ success: false, error: result.error ?? 'That code is invalid or has expired' },
			{ status: 400 }
		)
	}

	// verify-email does not return tokens — the client signs in afterwards.
	return json({ success: true })
}
