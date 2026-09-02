import { json, type RequestHandler } from '@sveltejs/kit'
import { auth } from '$lib/dontcode/server'
import { readJsonBody } from '$lib/dontcode/cookies'

/** Finish a password reset with the emailed code and the new password. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await readJsonBody(request)
	const code = typeof body.code === 'string' ? body.code.trim() : ''
	const password = typeof body.password === 'string' ? body.password : ''
	const email = typeof body.email === 'string' ? body.email.trim() : ''
	if (!code || !password) {
		return json(
			{ success: false, error: 'Enter the code from your email and a new password' },
			{ status: 400 }
		)
	}

	const result = await auth.resetPassword(code, password, email || undefined)
	if (!result.success) {
		return json(
			{ success: false, error: result.error ?? 'That code is invalid or has expired' },
			{ status: 400 }
		)
	}

	// reset-password does not return tokens; the client signs in afterwards.
	return json({ success: true })
}
