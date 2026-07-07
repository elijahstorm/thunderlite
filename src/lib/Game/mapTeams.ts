/**
 * Server-side helper: the teams a serialized map supports, in the engine's
 * stable (ascending) order. Shared by the /play loader, the lobby loader, and
 * the seat-pick endpoint so seat/team reasoning is identical everywhere. Empty
 * on a decode failure (callers fall back gracefully).
 */
import { deriveFromHash } from '$lib/Map/Editor/mapExporter'
import { derivePlayersFromMap } from '$lib/Engine/gameState'
import { logToErrorDb } from '$lib/Security/serverLogs'

export const teamsFromHash = (hash: string): number[] => {
	if (!hash) return []
	try {
		return derivePlayersFromMap(deriveFromHash(hash)).map((player) => player.team)
	} catch (msg) {
		logToErrorDb(msg)
		return []
	}
}
