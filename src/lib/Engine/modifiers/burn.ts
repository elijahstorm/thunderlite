import { terrainData } from '$lib/GameData/terrain'
import { adjacentTiles } from './cloak'

const terrainTypeByName = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`burn: missing terrain "${name}"`)
	return idx
}

const FOREST = terrainTypeByName('Forest')
// Burned forest becomes Charred Forest: the concealing canopy is gone (no Conceals,
// almost no cover) but the ground isn't poisoned — a burnt-woodland scar, not the
// toxic Wasteland tile. See terrain.ts for the appended type + its scorched sprite.
const SCORCHED = terrainTypeByName('Charred Forest')

// Every terrain type a burn can leave behind mid-match, given the types the map
// starts with. A Scorcher can be built at any point and scorch Forest to Charred
// Forest, so if Forest is anywhere on the board the sprite preload must warm that
// result too — otherwise a freshly-burned tile swaps to a type whose sheet was never
// loaded and paints blank. Mirrors `mineReachableTerrainTypes`; unioned into preload.
export const burnResultTerrainTypes = (terrainTypes: number[]): number[] =>
	terrainTypes.includes(FOREST) ? [SCORCHED] : []

/**
 * The Forest tiles a flame jet striking `tile` would ignite: the struck tile and
 * its four neighbours, keeping only the ones actually wooded. Shared by the commit
 * (which scorches them) and the animator (which paints fire on exactly those tiles)
 * so the two never disagree about where the treeline goes up.
 */
export const burnableForestTiles = (map: MapObject | MapProcesser, tile: number): number[] =>
	[tile, ...adjacentTiles(map as MapObject, tile)].filter(
		(t) => map.layers.ground[t]?.type === FOREST
	)

/**
 * The Scorcher's flame jet (Attack.Burn) sets the struck tile and its four
 * neighbours alight: any Forest caught is reduced to Charred Forest, permanently
 * stripping the treeline's concealment. Other terrain is left as-is.
 * Mirrors the Miner's in-place terrain mutation (mutate `.type`, reset `.state`).
 */
export const burnForestAround = (map: MapObject | MapProcesser, tile: number): void => {
	for (const t of burnableForestTiles(map, tile)) scorchTile(map, t)
}

/**
 * Scorch a single Forest tile to Charred Forest in place (mutate `.type`, reset
 * `.state`). No-op on non-forest. Split out so the animated commit path can defer
 * each tile's swap to its burn-materialize reveal while the instant commit path
 * (headless / replay) scorches the whole area at once via `burnForestAround`.
 */
export const scorchTile = (map: MapObject | MapProcesser, tile: number): void => {
	const ground = map.layers.ground[tile]
	if (ground && ground.type === FOREST) {
		ground.type = SCORCHED
		ground.state = 0
	}
}
