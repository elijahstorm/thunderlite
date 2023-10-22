import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'

export const generateAttackList = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	existing: number[],
	range = unitData[unit.type].range[1],
	gap = unitData[unit.type].range[0]
) => [...new Set(increment(map, tile, unit, existing, range, gap))]

// range = [start, end]

const increment: (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	existing: number[],
	range: number,
	gap: number
) => number[] = (map, tile, unit, existing, range, gap) => [
	...add(map, tile, unit, existing, 'right', range, gap),
	...add(map, tile, unit, existing, 'left', range, gap),
	...add(map, tile, unit, existing, 'up', range, gap),
	...add(map, tile, unit, existing, 'down', range, gap),
]

const add = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	existing: number[],
	direction: keyof typeof directionDecision,
	range: number,
	gap: number
) =>
	addAttackables(
		map,
		updateTileDecision[direction](map, tile, gap),
		unit,
		existing,
		direction,
		range,
		gap
	)

const addAttackables = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	existing: number[],
	direction: keyof typeof directionDecision,
	range: number,
	gap: number
) =>
	!existing.includes(tile) && isAttackable(map, tile, unit, direction, range, gap)
		? [tile, ...increment(map, tile, unit, existing, range - gap, 1)]
		: []

const isAttackable = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	direction: keyof typeof directionDecision,
	range: number,
	gap: number
) =>
	range - gap >= 0 &&
	directionDecision[direction](map, tile, gap) &&
	map.layers.units[tile] &&
	map.layers.units[tile]?.team !== unit.team &&
	notHidden(map, tile)

const notHidden = (map: MapObject, tile: number) =>
	(terrainData[map.layers.ground[tile].type].name !== 'Canyon' ||
		unitData[map.layers.units[tile]?.type as number]?.type === 'ground') &&
	(!map.layers.sky[tile] || unitData[map.layers.units[tile]?.type as number]?.type === 'air')

const updateTileDecision = {
	right: (map: MapObject, tile: number, gap: number) => tile + gap,
	left: (map: MapObject, tile: number, gap: number) => tile - gap,
	up: (map: MapObject, tile: number, gap: number) => tile - map.cols * gap,
	down: (map: MapObject, tile: number, gap: number) => tile + map.cols * gap,
} as const

const directionDecision = {
	right: (map: MapObject, tile: number, gap: number) =>
		((map.cols + tile - gap) % map.cols) - 1 === Math.floor(tile / map.cols),
	left: (map: MapObject, tile: number, gap: number) =>
		Math.floor((tile + gap) / map.cols) === Math.floor(tile / map.cols),
	up: (map: MapObject, tile: number) => tile > 0,
	down: (map: MapObject, tile: number) => tile < map.cols * map.rows,
} as const
