import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { isValidMapId } from '$lib/Map/hashLoader.js'
import { gameStore } from '$lib/Game/store.server'
import { seatsForMap } from '$lib/Game/mapTeams'
import { clampAsyncTimeout, isGameMode, type GameMode } from '$lib/Game/asyncConfig'

export const POST = async ({ request, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const { mapId, mode: rawMode, turnTimeoutMs } = await request.json()
	if (!mapId) throw error(400, 'Please provide a map id')
	if (!(await isValidMapId(mapId))) throw error(400, 'Map with that id does not exist')
	// The game type is host-chosen at creation and immutable after. Default is
	// live; an async room additionally carries its per-turn clock, clamped to
	// the allowed range so a crafted payload can't set an absurd timeout.
	if (rawMode !== undefined && !isGameMode(rawMode)) throw error(400, 'Invalid game mode')
	const mode: GameMode = rawMode === 'async' ? 'async' : 'live'

	// Seats come from the MAP, one per side it fields: a three-side board opens a
	// three-seat room. Anything less and the sides nobody takes have no commander
	// at all, which deadlocks the match when the turn rotation reaches them.
	const maxPlayers = await seatsForMap(mapId)

	try {
		// `locals.user` is the DontCode id, which is the player's public
		// `profiles(auth)` — stored on the seat so `/play` can show their username.
		const session = await gameStore.createRoom(userSession, mapId, locals.user ?? '', {
			mode,
			turnTimeoutMs: mode === 'async' ? clampAsyncTimeout(turnTimeoutMs) : null,
			maxPlayers,
		})
		return json({ session })
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not create game session')
	}
}
