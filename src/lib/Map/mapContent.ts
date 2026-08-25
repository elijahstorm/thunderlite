/**
 * Questions about what a serialized board actually *contains*, asked by the
 * places that must refuse to act on an empty one.
 *
 * Kept apart from `mapExporter` (which owns the encoding) and from the routes
 * that use these (which own the HTTP shape), so the rules themselves stay
 * testable without a request or a database.
 */
import { deriveFromHash } from './Editor/mapExporter'

/**
 * How many units + buildings a serialized board carries, or null when the blob
 * can't be decoded.
 *
 * Null is deliberately distinct from 0: a caller refusing an *empty* board must
 * not also refuse one it merely failed to parse. The base62 decode is O(n^2) in
 * board size, so only reach for this when a decision depends on the answer.
 */
export const placeableCount = (hash: string): number | null => {
	try {
		const { layers } = deriveFromHash(hash)
		return layers.units.filter(Boolean).length + layers.buildings.filter(Boolean).length
	} catch {
		return null
	}
}

/**
 * Would saving `incoming` over `stored` replace a real board with bare terrain?
 *
 * Overwriting a map is destructive and there is no history to roll back to, so
 * this is the last line of defence behind an editor that hands the save path a
 * board the user was never looking at. Unknown (undecodable) input answers
 * false — refusing a save we merely failed to parse would be the worse mistake.
 */
export const wouldWipeBoard = (incoming: string, stored: string | null | undefined): boolean => {
	if (!stored) return false
	if (placeableCount(incoming) !== 0) return false
	return (placeableCount(stored) ?? 0) > 0
}

/**
 * Whether the editor's in-memory board belongs to the map the route names, and
 * may therefore be resumed instead of re-derived from that route's hash.
 *
 * `mapStore` survives client-side navigation, so it can hold a board from a
 * different map entirely — the bare `/editor` route writes a blank board there
 * before its own `goto('/editor/<lastId>')` fires. Resuming that unconditionally
 * handed a stale board the id of whatever map the route named, and the next Save
 * overwrote a real saved map with it. The board only carries over when it is
 * this map's board, or when the route names no map at all.
 */
export const canResumeInMemoryMap = (input: {
	hasStoredMap: boolean
	/** The map id in the URL, or undefined on the bare `/editor` route. */
	routeMapId?: string
	/** The map id the in-memory board is linked to (`activeMapIdStore`). */
	storedMapId?: string
}): boolean =>
	input.hasStoredMap && (input.routeMapId == null || input.storedMapId === input.routeMapId)
