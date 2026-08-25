import { writable } from 'svelte/store'
import { buildingData } from '$lib/GameData/building'
import { animateExplosion } from './Animator/animator'
import { resetCaptureProgress } from './modifiers/capture'
import { NEUTRAL_TEAM } from './gameState'

/**
 * Number of defeat sequences currently playing. The results screen waits for
 * this to drain to 0 before it appears, so a defeated army's explosions aren't
 * instantly hidden behind it.
 */
export const defeatAnimating = writable(0)

/**
 * Board half of a defeat, with no animation: destroy the dead `team`'s units and
 * revert its buildings to neutral. Returns the tiles a unit was cleared from, so
 * a caller that animates can blast exactly those.
 *
 * Their buildings are NOT destroyed: ownership reverts to neutral (so a surviving
 * enemy can recapture them) and capture progress resets.
 *
 * Critically, only the dead team's own units are removed. A building the dead team
 * owned may have a *surviving* enemy unit standing on it (e.g. the unit that just
 * captured the deciding tile); that unit must be left untouched.
 *
 * Split out from `animateTeamDefeat` for surfaces that replay a log without the
 * live client's animation stack — see `ReplayViewer`, which has no
 * GameStateManager to drive the defeat and must still get the same board.
 */
export const resolveTeamDefeat = (map: MapObject, team: number): number[] => {
	const explosionTiles = new Set<number>()

	// Destroy the defeated team's units only — never a tile's occupant by virtue of
	// a building sitting under it.
	for (let tile = 0; tile < map.layers.units.length; tile++) {
		const unit = map.layers.units[tile]
		if (unit && unit.team === team) {
			// A defeated unit mid-capture abandons whatever enemy building it held.
			resetCaptureProgress(map.layers.buildings[tile], unit.team)
			map.layers.units[tile] = null
			explosionTiles.add(tile)
		}
	}

	// Revert the defeated team's buildings to neutral ownership rather than removing
	// them, resetting capture stature so they sit uncontested until recaptured.
	for (let tile = 0; tile < map.layers.buildings.length; tile++) {
		const building = map.layers.buildings[tile]
		if (building && building.team === team) {
			building.team = NEUTRAL_TEAM
			building.stature = buildingData[building.type]?.stature ?? 0
		}
	}

	return [...explosionTiles]
}

/**
 * Resolve a defeated `team`'s board presence and play the death blast: the units
 * are cleared first so each sprite vanishes under its explosion. Resolves once
 * every blast finishes.
 *
 * Driven from the live client (GameStateManager) when a team's `hasLost` flips,
 * so it runs for both a forfeit and a "lost your last unit/HQ" defeat.
 */
export const animateTeamDefeat = async (map: MapObject, team: number): Promise<void> => {
	const explosionTiles = resolveTeamDefeat(map, team)

	if (explosionTiles.length === 0) return

	defeatAnimating.update((n) => n + 1)
	try {
		await Promise.all(explosionTiles.map((tile) => animateExplosion(map, tile)))
	} finally {
		defeatAnimating.update((n) => Math.max(0, n - 1))
	}
}
