import { terrainData } from '$lib/GameData/terrain'
import type { ModifierKey } from './index'

// True when the terrain occupying `tile` carries `mod`. Terrain modifiers live on
// the tile rather than on a unit, so — unlike `hasModifier` — they apply to
// whoever happens to be standing there (e.g. a Canyon's `Trench`).
export const tileHasModifier = (
	map: Pick<MapObject, 'layers'>,
	tile: number,
	mod: ModifierKey
): boolean => terrainData[map.layers.ground[tile]?.type]?.modifiers.includes(mod) ?? false
