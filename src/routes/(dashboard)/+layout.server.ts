import type { LayoutServerLoad } from './$types'
import { db } from '$lib/dontcode/server'
import { gameStore } from '$lib/Game/store.server'

export const prerender = false

/**
 * One count per dashboard page view so the Friends nav item can carry a badge.
 * Pending requests are otherwise invisible until the recipient happens to open
 * the friends page (or reads the email), which is how they went unnoticed.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const me = locals.user
	if (!me) return { friendRequests: 0, awaitingTurns: 0 }

	try {
		// Two badges, one round of counts: pending friend requests and async games
		// waiting on this player's move. Both are otherwise invisible until they
		// happen to open the page that lists them.
		const [friendRequests, awaitingTurns] = await Promise.all([
			db.count('relationships', { target: me, status: 'friend-request' }),
			locals.session ? gameStore.countAwaitingTurns(locals.session) : Promise.resolve(0),
		])
		return { friendRequests, awaitingTurns }
	} catch {
		// A badge is not worth failing the whole dashboard shell over.
		return { friendRequests: 0, awaitingTurns: 0 }
	}
}
