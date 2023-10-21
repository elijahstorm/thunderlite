import { unitData } from '$lib/GameData/unit'

export const generateMovementList = (map: MapObject, tile: number, unit: UnitObject) => [
	tile + unitData[unit.type].movement,
	tile - unitData[unit.type].movement,
	tile + map.cols * unitData[unit.type].movement,
	tile - map.cols * unitData[unit.type].movement,
]
