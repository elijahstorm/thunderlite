import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'

export const generateMovementList = (map: MapObject, tile: number, unit: UnitObject) => [
	...new Set([
		tile,
		...removeOccupied(map, increment(map, tile, unit, unitData[unit.type].movement)),
	]),
]

const removeOccupied = (map: MapObject, tiles: number[]) =>
	tiles.filter((tile) => !map.layers.units[tile])

const increment: (map: MapObject, tile: number, unit: UnitObject, movement: number) => number[] = (
	map,
	tile,
	unit,
	movement
) => [
	...move(map, tile, unit, movement, 'right'),
	...move(map, tile, unit, movement, 'left'),
	...move(map, tile, unit, movement, 'up'),
	...move(map, tile, unit, movement, 'down'),
]

const move = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	movement: number,
	direction: keyof typeof directionDecision
) => addWalkableTiles(map, updateTileDecision[direction](map, tile), unit, movement, direction)

const addWalkableTiles = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	movement: number,
	direction: keyof typeof directionDecision
) =>
	isWalkable(map, tile, unit, movement, direction)
		? [tile, ...increment(map, tile, unit, movement - drag(unit, map.layers.ground[tile]))]
		: []

const isWalkable = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	movement: number,
	direction: keyof typeof directionDecision
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
