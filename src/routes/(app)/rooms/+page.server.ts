import type { PageServerLoad } from './$types'
import { gameStore } from '$lib/Game/store.server'

export const load: PageServerLoad = async ({ locals }) => {
	const gameData = locals.session ? await gameStore.currentGame(locals.session) : null

	return {
		user: locals.user,
		session: locals.session,
		gameData,
	}
}
