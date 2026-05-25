import { terrainData } from '$lib/GameData/terrain'
import { isRanged } from './canAttack'

export const extraSightBonus = (
	map: Pick<MapObject, 'layers'>,
	tile: number,
	unit: UnitObject
): number => {
	const ground = map.layers.ground[tile]
	if (!ground) return 0
	const terrain = terrainData[ground.type]
	if (!terrain || !terrain.modifiers.includes('Extra_Sight')) return 0

	if (isRanged(unit)) return 1

	if (terrain.name === 'Mountain') return 2
	return 1
}
