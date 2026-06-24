import { terrainData } from '$lib/GameData/terrain'
import { isRanged } from './canAttack'
import { heightTier } from './height'

// Sight radius granted by high ground. The `Extra_Sight` terrain modifier marks a
// tile as a vantage point; the size of the bonus is the tile's height tier, so a
// Mountain (tier 2) sees one further than Hills (tier 1) with no hardcoded names.
// Applies equally to every unit — elevation helps anyone see farther.
export const extraSightBonus = (map: Pick<MapObject, 'layers'>, tile: number): number => {
	const ground = map.layers.ground[tile]
	if (!ground) return 0
	const terrain = terrainData[ground.type]
	if (!terrain || !terrain.modifiers.includes('Extra_Sight')) return 0

	return Math.max(0, heightTier(terrain.height))
}

// Extra attack range granted by high ground. Like the sight bonus this hangs off
// the `Extra_Sight` terrain modifier (Hills, Mountain): a longer sightline lets an
// indirect weapon arc one tile further. Only ranged units benefit — a direct unit's
// reach is fixed at point-blank, so it gains nothing from elevation.
export const extraRangeBonus = (
	map: Pick<MapObject, 'layers'>,
	tile: number,
	unit: UnitObject
): number => {
	const ground = map.layers.ground[tile]
	if (!ground) return 0
	const terrain = terrainData[ground.type]
	if (!terrain || !terrain.modifiers.includes('Extra_Sight')) return 0

	return isRanged(unit) ? 1 : 0
}
