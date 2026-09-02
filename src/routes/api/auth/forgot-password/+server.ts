import { json, type RequestHandler } from '@sveltejs/kit'
import { auth } from '$lib/dontcode/server'
import { readJsonBody } from '$lib/dontcode/cookies'

/**
 * Start a password reset: the platform emails a one-time code to the address.
 *
 * Deliberately answers `success` whether or not an account exists, so the form
 * can't be used to probe which emails are registered. Only throttling is
 * surfaced, since the user can act on that.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await readJsonBody(request)
	const email = typeof body.email === 'string' ? body.email.trim() : ''
	if (!email) {
		return json({ success: false, error: 'Enter your email address' }, { status: 400 })
	}

	const result = await auth.forgotPassword(email)
	if (!result.success && /limit|toomany|throttl/i.test(result.code ?? '')) {
		return json(
			{ success: false, error: 'Too many attempts. Please wait a few minutes and try again.' },
			{ status: 429 }
		)
	}

	return json({ success: true })
}
