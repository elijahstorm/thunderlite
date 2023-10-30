import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'

export const generateAttackList = (map: MapObject, tile: number, unit: UnitObject) => {
	const [start, end] = unitData[unit.type].range

	return [...new Set(diamond(map, tile, unit, start, end))]
}

const diamond = (map: MapObject, tile: number, unit: UnitObject, start: number, end: number) => {
	let result: number[] = []

	for (let i = start; i <= end; i++) {
		for (let j = 0; j < i; j++) {
			result = [
				...result,
				...addAttackable(map, findTargetTile(map, tile, 'left', 'down', i, j), unit),
				...addAttackable(map, findTargetTile(map, tile, 'right', 'up', i, j), unit),
				...addAttackable(map, findTargetTile(map, tile, 'down', 'right', i, j), unit),
				...addAttackable(map, findTargetTile(map, tile, 'up', 'left', i, j), unit),
			]
		}
	}

	return result
}

const findTargetTile = (
	map: MapObject,
	tile: number,
	direction1: keyof typeof directionDecision,
	direction2: keyof typeof directionDecision,
	amount1: number,
	amount2: number
) =>
	directionDecision[direction2](
		map,
		directionDecision[direction1](map, tile, amount1 - amount2),
		amount2
	)

const addAttackable = (map: MapObject, target: number | null, unit: UnitObject) =>
	isAttackable(map, target, unit) ? [target as number] : []

const isAttackable = (map: MapObject, tile: number | null, unit: UnitObject) =>
	tile !== null &&
	map.layers.units[tile] &&
	map.layers.units[tile]?.team !== unit.team &&
	notHidden(map, tile)

const notHidden = (map: MapObject, tile: number) =>
	(terrainData[map.layers.ground[tile].type].name !== 'Canyon' ||
		unitData[map.layers.units[tile]?.type as number]?.type === 'ground') &&
	(!map.layers.sky[tile] || unitData[map.layers.units[tile]?.type as number]?.type === 'air')

const directionDecision = {
	right: (map: MapObject, tile: number | null, amount: number) =>
		tile !== null && (tile % map.cols) + amount < map.cols ? tile + amount : null,
	left: (map: MapObject, tile: number | null, amount: number) =>
		tile !== null && tile % map.cols >= amount ? tile - amount : null,
	up: (map: MapObject, tile: number | null, amount: number) =>
		tile !== null && tile >= map.cols * amount ? tile - map.cols * amount : null,
	down: (map: MapObject, tile: number | null, amount: number) =>
		tile !== null && tile + map.cols * amount < map.cols * map.rows
			? tile + map.cols * amount
			: null,
} as const
