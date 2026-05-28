import { writable } from 'svelte/store'
import { animateExplosion } from './Animator/animator'

/**
 * Number of defeat sequences currently playing. The results screen waits for
 * this to drain to 0 before it appears, so a defeated army's explosions aren't
 * instantly hidden behind it.
 */
export const defeatAnimating = writable(0)

/**
 * Blow up everything a defeated `team` still owns. Their units and buildings are
 * cleared from the board first (so the sprites vanish under the blast), then a
 * death explosion plays on each former tile. Resolves once every blast finishes.
 *
 * Driven from the live client (GameStateManager) when a team's `hasLost` flips,
 * so it runs for both a forfeit and a "lost your last unit/HQ" defeat. A tile
 * holding both a unit and a building gets a single explosion.
 */
export const animateTeamDefeat = async (map: MapObject, team: number): Promise<void> => {
	const tiles = new Set<number>()
	for (let tile = 0; tile < map.layers.units.length; tile++) {
		const unit = map.layers.units[tile]
		if (unit && unit.team === team) tiles.add(tile)
	}
	for (let tile = 0; tile < map.layers.buildings.length; tile++) {
		const building = map.layers.buildings[tile]
		if (building && building.team === team) tiles.add(tile)
	}
	if (tiles.size === 0) return

	for (const tile of tiles) {
		map.layers.units[tile] = null
		map.layers.buildings[tile] = null
	}

	defeatAnimating.update((n) => n + 1)
	try {
		await Promise.all([...tiles].map((tile) => animateExplosion(map, tile)))
	} finally {
		defeatAnimating.update((n) => Math.max(0, n - 1))
	}
}
