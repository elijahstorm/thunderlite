import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'

export const generateMovementList = (map: MapObject, tile: number, unit: UnitObject) => [
	...new Set(increment(map, unit, tile, unitData[unit.type].movement)),
]

const increment: (map: MapObject, unit: UnitObject, tile: number, movement: number) => number[] = (
	map,
	unit,
	tile,
	movement
) => [
	...move(map, unit, tile, movement, 'right'),
	...move(map, unit, tile, movement, 'left'),
	...move(map, unit, tile, movement, 'up'),
	...move(map, unit, tile, movement, 'down'),
]

const move = (
	map: MapObject,
	unit: UnitObject,
	tile: number,
	movement: number,
	direction: keyof typeof directionDecision
) => addWalkableTiles(map, unit, updateTileDecision[direction](map, tile), movement, direction)

const addWalkableTiles = (
	map: MapObject,
	unit: UnitObject,
	tile: number,
	movement: number,
	direction: keyof typeof directionDecision
) =>
	isWalkable(map, tile, movement, direction, unit)
		? [tile, ...increment(map, unit, tile, movement - drag(unit, map.layers.ground[tile]))]
		: []

const isWalkable = (
	map: MapObject,
	tile: number,
	movement: number,
	direction: keyof typeof directionDecision,
	unit: UnitObject
) =>
	directionDecision[direction](map, tile) &&
	movement >= drag(unit, map.layers.ground[tile]) &&
	notBlocked(map, tile, unit) &&
	validTerrain(map.layers.ground[tile], unit)

const IMPASSABLE = 9999
const drag = (unit: UnitObject, terrain: GroundObject) =>
	unitData[unit.type].type === 'air'
		? 1
		: ((terrainData[terrain.type].name === 'Shore' &&
				unitData[unit.type].movementType === 'warship') ||
		  (terrainData[terrain.type].details === 'rugged' &&
				(unitData[unit.type].movementType === 'wheel' ||
					unitData[unit.type].movementType === 'tank'))
				? IMPASSABLE
				: terrainData[terrain.type].details === 'rough' &&
				  (unitData[unit.type].movementType === 'wheel' ||
						unitData[unit.type].movementType === 'boat')
				? 3
				: (terrainData[terrain.type].details === 'slippery' &&
						unitData[unit.type].movementType === 'foot') ||
				  (terrainData[terrain.type].details === 'dirty' &&
						unitData[unit.type].movementType === 'wheel')
				? 2
				: 1) * terrainData[terrain.type].drag

const notBlocked = (map: MapObject, tile: number, unit: UnitObject) =>
	!map.layers.units[tile] || map.layers.units[tile]?.team === unit.team

const validTerrain = (terrain: GroundObject, unit: UnitObject) =>
	unitData[unit.type].movementType !== 'none' &&
	terrainData[terrain.type].details !== 'impassable' &&
	(unitData[unit.type].type === 'air' ||
		terrainData[terrain.type].name === 'Shore' ||
		(terrainData[terrain.type].ocean && unitData[unit.type].type === 'sea') ||
		(!terrainData[terrain.type].ocean && unitData[unit.type].type === 'ground'))

const updateTileDecision = {
	right: (map: MapObject, tile: number) => tile + 1,
	left: (map: MapObject, tile: number) => tile - 1,
	up: (map: MapObject, tile: number) => tile - map.cols,
	down: (map: MapObject, tile: number) => tile + map.cols,
} as const

const directionDecision = {
	right: (map: MapObject, tile: number) => tile % map.cols !== 0,
	left: (map: MapObject, tile: number) => (tile + 1) % map.cols !== 0,
	up: (map: MapObject, tile: number) => tile > 0,
	down: (map: MapObject, tile: number) => tile < map.cols * map.rows,
} as const
