import { get } from 'svelte/store'
import { buildingData } from '$lib/GameData/building'
import { gameState, type GameState } from './gameState'
import { buildableUnits } from './build'

/**
 * Does the current team still have anything it could do this turn? Mirrors the
 * engine's own selection gates so it never disagrees with what the player can
 * actually click:
 *
 *  - A unit is pending while its tile isn't in `actedTiles` (same rule as
 *    `canSelectUnit`).
 *  - An actable building is pending while it's unacted, not standing under a
 *    unit (a unit on the tile takes selection priority over the building, per
 *    the `select` interactor), and the owner can still afford to build at least
 *    one unit from it. An empty, broke, or fully-blocked factory offers no real
 *    action, so it doesn't keep the turn alive.
 *
 * Used to auto-end a turn once nothing is left to do.
 */
export const teamHasPendingActions = (
	map: MapObject | MapProcesser,
	state: GameState = get(gameState)
): boolean => {
	const team = state.currentTeam

	for (let tile = 0; tile < map.layers.units.length; tile++) {
		const unit = map.layers.units[tile]
		if (!unit || unit.team !== team) continue
		if (!state.actedTiles.has(tile)) return true
	}

	const player = state.players.find((p) => p.team === team)
	if (!player) return false
	if (!buildableUnits(player).some((u) => u.buildable)) return false

	for (let tile = 0; tile < map.layers.buildings.length; tile++) {
		const building = map.layers.buildings[tile]
		if (!building || building.team !== team) continue
		if (!buildingData[building.type]?.actable) continue
		if (state.actedTiles.has(tile)) continue
		if (map.layers.units[tile] != null) continue
		return true
	}

	return false
}
