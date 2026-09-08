import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore } from '$lib/Game/store.server'

/**
 * The next async game (by the same "your-turn-first, soonest deadline" order
 * as the /rooms list) where it's this player's move. Backs the in-game "Next
 * game" button that replaces "Opponent's turn" once there's nothing left to
 * do here — the button itself doesn't know the player's other async games,
 * only this endpoint's answer.
 *
 * `exclude` is the room the asker is already sitting in, and it is not optional
 * in practice. `yourTurn` is read off `game_room.current_turn`, which only moves
 * when the end-turn reaches the log — so a player who has just ended their turn
 * on their own board, but whose handover has not been recorded yet (a relay
 * still in flight, or one that failed), is still "your turn" in this room. The
 * list sorts your-turn games first, so that room is the FIRST answer, and the
 * button then navigated the player to the game they were already on: nothing
 * changed on screen, and the failed handover behind it stayed invisible until
 * the desync banner appeared seconds later.
 */
export const GET = async ({ locals, url }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const exclude = url.searchParams.get('exclude')

	try {
		const games = await gameStore.listMyAsyncGames(userSession)
		const next = games.find((g) => g.started && g.yourTurn && g.session !== exclude)
		return json({ session: next?.session ?? null })
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not look up async games')
	}
}
