import type { LayoutServerLoad } from './$types'
import { db } from '$lib/dontcode/server'

export const prerender = false

/**
 * One count per dashboard page view so the Friends nav item can carry a badge.
 * Pending requests are otherwise invisible until the recipient happens to open
 * the friends page (or reads the email), which is how they went unnoticed.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const me = locals.user
	if (!me) return { friendRequests: 0 }

	try {
		return {
			friendRequests: await db.count('relationships', { target: me, status: 'friend-request' }),
		}
	} catch {
		// A badge is not worth failing the whole dashboard shell over.
		return { friendRequests: 0 }
	}
}
