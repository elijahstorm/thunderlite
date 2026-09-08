import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore } from '$lib/Game/store.server'

/**
 * The next async game (by the same "your-turn-first, soonest deadline" order
 * as the /rooms list) where it's this player's move. Backs the in-game "Next
 * game" button that replaces "Opponent's turn" once there's nothing left to
 * do here — the button itself doesn't know the player's other async games,
 * only this endpoint's answer.
 */
export const GET = async ({ locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	try {
		const games = await gameStore.listMyAsyncGames(userSession)
		const next = games.find((g) => g.started && g.yourTurn)
		return json({ session: next?.session ?? null })
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not look up async games')
	}
}
