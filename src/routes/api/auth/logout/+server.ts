import { json, type RequestHandler } from '@sveltejs/kit'
import { clearAccessTokenCookie } from '$lib/dontcode/cookies'

export const POST: RequestHandler = async ({ cookies }) => {
	clearAccessTokenCookie(cookies)
	return json({ success: true })
}
