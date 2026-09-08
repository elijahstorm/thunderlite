import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { gameStore } from '$lib/Game/store.server'
import { listAsyncGames } from '$lib/Game/asyncGameList.server'
import { db } from '$lib/dontcode/server'

/**
 * The games hub: everything this player currently has in flight. Correspondence
 * games are the bulk of it (a player can hold many at once), plus the single
 * live room they may be sitting in — live play is one-at-a-time by design, so
 * it gets one card rather than a list.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session) throw redirect(303, '/login')
	const userSession = locals.session

	const [asyncGames, current] = await Promise.all([
		listAsyncGames(userSession, locals.user ?? ''),
		gameStore.currentGame(userSession),
	])

	// The live pointer, only when it really is a live room — an async game the
	// player joined also sets the pointer, and it is already in the list above.
	const liveRoom =
		current && current.room?.mode !== 'async'
			? {
					session: current.session,
					mapId: current.mapId,
					started: current.room?.start_at != null && Number(current.room.start_at) <= Date.now(),
					mapName:
						(
							await db
								.findOne<{ name: string }>('maps', {
									where: { public_id: current.mapId },
									select: ['name'],
								})
								.catch(() => null)
						)?.name ?? 'Custom map',
				}
			: null

	return {
		asyncGames,
		liveRoom,
		awaiting: asyncGames.filter((g) => g.started && g.yourTurn).length,
	}
}
