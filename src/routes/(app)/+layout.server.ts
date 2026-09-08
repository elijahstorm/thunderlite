import type { LayoutServerLoad } from './$types'
import { gameStore } from '$lib/Game/store.server'

export const prerender = false

/**
 * One cheap count per in-app page view, so the "Games" nav item can carry the
 * number of correspondence games waiting on this player's move. Without it an
 * async game is invisible between emails, which is exactly when a player is
 * most likely to forget it exists.
 *
 * `countAwaitingTurns` is deliberately a single count query — see its note in
 * the store for why the full list sweep is not used here.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.session) return { awaitingTurns: 0 }
	try {
		return { awaitingTurns: await gameStore.countAwaitingTurns(locals.session) }
	} catch {
		// A badge is never worth failing a page over.
		return { awaitingTurns: 0 }
	}
}
