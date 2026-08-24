/**
 * Server-side helper: the teams a serialized map supports, in the engine's
 * stable (ascending) order. Shared by the /play loader, the lobby loader, and
 * the seat-pick endpoint so seat/team reasoning is identical everywhere. Empty
 * on a decode failure (callers fall back gracefully). Async only so the
 * decode-failure log lands before the response ends.
 */
import { deriveFromHash } from '$lib/Map/Editor/mapExporter'
import { derivePlayersFromMap } from '$lib/Engine/gameState'
import { getMapData } from '$lib/Map/hashLoader'
import { logToErrorDb } from '$lib/Security/serverLogs'

export const teamsFromHash = async (hash: string): Promise<number[]> => {
	if (!hash) return []
	try {
		return derivePlayersFromMap(deriveFromHash(hash)).map((player) => player.team)
	} catch (msg) {
		await logToErrorDb(msg)
		return []
	}
}

/**
 * How many seats a room on this map needs: one per side the board actually
 * fields. This is the room's capacity (see `game_room.max_players`) — a map
 * with three sides needs three commanders, human or CPU, or the side nobody
 * owns deadlocks the match when the turn rotation reaches it.
 *
 * Null on any failure (missing map, undecodable blob, no teams) so the caller
 * falls back to the room default rather than creating a room that can't fill.
 */
export const seatsForMap = async (mapId: string): Promise<number | null> => {
	try {
		const { mapHash } = await getMapData(mapId)
		const teams = await teamsFromHash(mapHash)
		return teams.length > 0 ? teams.length : null
	} catch (msg) {
		await logToErrorDb(msg)
		return null
	}
}
