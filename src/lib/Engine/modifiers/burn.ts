import { terrainData } from '$lib/GameData/terrain'
import { adjacentTiles } from './cloak'

const terrainTypeByName = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`burn: missing terrain "${name}"`)
	return idx
}

const FOREST = terrainTypeByName('Forest')
// Burned forest becomes Wasteland: no Conceals cover, lots of exposed defense
// loss, and it chips the health of anything that lingers on the cinders.
const SCORCHED = terrainTypeByName('Wasteland')

/**
 * The Scorcher's flame jet (Attack.Burn) sets the struck tile and its four
 * neighbours alight: any Forest caught is reduced to scorched Wasteland,
 * permanently stripping the treeline's concealment. Other terrain is left as-is.
 * Mirrors the Miner's in-place terrain mutation (mutate `.type`, reset `.state`).
 */
export const burnForestAround = (map: MapObject | MapProcesser, tile: number): void => {
	for (const t of [tile, ...adjacentTiles(map as MapObject, tile)]) {
		const ground = map.layers.ground[t]
		if (ground && ground.type === FOREST) {
			ground.type = SCORCHED
			ground.state = 0
		}
	}
}
