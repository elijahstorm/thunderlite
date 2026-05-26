import { skyData } from '$lib/GameData/sky'
import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { isJammedFor } from '$lib/Engine/modifiers/jamming'

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
		? [
				tile,
				...increment(
					map,
					tile,
					unit,
					movement - drag(unit, map.layers.ground[tile], map.layers.sky[tile])
				),
			]
		: []

const isWalkable = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	movement: number,
	direction: keyof typeof directionDecision
) =>
	directionDecision[direction](map, tile) &&
	movement >= drag(unit, map.layers.ground[tile], map.layers.sky[tile]) &&
	notBlocked(map, tile, unit) &&
	notJammed(map, tile, unit) &&
	validTerrain(map.layers.ground[tile], unit)

const notJammed = (map: MapObject, tile: number, unit: UnitObject): boolean => {
	if (unitData[unit.type].type !== 'air') return true
	return !isJammedFor(map, tile, unit.team)
}

const IMPASSABLE = 9999
export const drag = (unit: UnitObject, terrain: GroundObject, sky?: SkyObject | null) =>
	unitData[unit.type].type === 'air'
		? sky && skyData[sky.type]?.modifiers.includes('treacherous')
			? skyData[sky.type].drag
			: 1
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

export const validTerrain = (terrain: GroundObject, unit: UnitObject) => {
	const u = unitData[unit.type]
	const t = terrainData[terrain.type]
	if (u.movementType === 'none') return false
	if (t.details === 'impassable') return false
	if (u.type === 'air') return true
	if (t.name === 'Shore') return true
	if (t.ocean) return u.type === 'sea'
	return u.type === 'ground'
}

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
