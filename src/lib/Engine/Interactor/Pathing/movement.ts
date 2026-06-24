import { skyData } from '$lib/GameData/sky'
import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { isJammedFor } from '$lib/Engine/modifiers/jamming'

const NO_CONCEALED: ReadonlySet<number> = new Set()

// `concealed` lists tiles the moving team can't perceive (fog / stealth — see
// `concealedEnemyTiles`). Pathing treats them as empty: a unit routes through and
// can target them as destinations as if no enemy were there, so a blocked path
// never betrays a hidden unit's position. Defaults to empty — callers that know
// the full board (e.g. the CPU planner) get the old "every enemy blocks" behavior.
export const generateMovementList = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	concealed: ReadonlySet<number> = NO_CONCEALED
) => [
	...new Set([
		tile,
		...removeOccupied(map, increment(map, tile, unit, unitData[unit.type].movement, concealed), concealed),
	]),
]

const removeOccupied = (map: MapObject, tiles: number[], concealed: ReadonlySet<number>) =>
	tiles.filter((tile) => !map.layers.units[tile] || concealed.has(tile))

const increment: (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	movement: number,
	concealed: ReadonlySet<number>
) => number[] = (map, tile, unit, movement, concealed) => [
	...move(map, tile, unit, movement, 'right', concealed),
	...move(map, tile, unit, movement, 'left', concealed),
	...move(map, tile, unit, movement, 'up', concealed),
	...move(map, tile, unit, movement, 'down', concealed),
]

const move = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	movement: number,
	direction: keyof typeof directionDecision,
	concealed: ReadonlySet<number>
) =>
	addWalkableTiles(map, updateTileDecision[direction](map, tile), unit, movement, direction, concealed)

const addWalkableTiles = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	movement: number,
	direction: keyof typeof directionDecision,
	concealed: ReadonlySet<number>
) =>
	isWalkable(map, tile, unit, movement, direction, concealed)
		? [
				tile,
				...increment(
					map,
					tile,
					unit,
					movement - drag(unit, map.layers.ground[tile], map.layers.sky[tile]),
					concealed
				),
			]
		: []

const isWalkable = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	movement: number,
	direction: keyof typeof directionDecision,
	concealed: ReadonlySet<number>
) =>
	directionDecision[direction](map, tile) &&
	movement >= drag(unit, map.layers.ground[tile], map.layers.sky[tile]) &&
	notBlocked(map, tile, unit, concealed) &&
	notJammed(map, tile, unit) &&
	validTerrain(map.layers.ground[tile], unit)

const notJammed = (map: MapObject, tile: number, unit: UnitObject): boolean => {
	if (unitData[unit.type].type !== 'air') return true
	return !isJammedFor(map, tile, unit.team)
}

const IMPASSABLE = 9999
export const drag = (unit: UnitObject, terrain: GroundObject, sky?: SkyObject | null) => {
	const u = unitData[unit.type]
	const t = terrainData[terrain.type]
	if (u.type === 'air')
		return sky && skyData[sky.type]?.modifiers.includes('treacherous') ? skyData[sky.type].drag : 1
	// Tires cross rough terrain (hills, forest) poorly, but the 3x penalty already IS
	// the final cost — it must NOT also be scaled by the terrain's own `drag`, or a
	// wheel unit would spend its entire move climbing a single hill (3 * drag 2 = 6).
	// Every other movement type still scales by terrain drag below.
	if (t.details === 'rough' && u.movementType === 'wheel') return 3
	return (
		(t.name === 'Shore' && u.movementType === 'warship') ||
		(t.details === 'rugged' && (u.movementType === 'wheel' || u.movementType === 'tank'))
			? IMPASSABLE
			: t.details === 'rough' && u.movementType === 'boat'
				? 3
				: (t.details === 'slippery' && u.movementType === 'foot') ||
					  (t.details === 'dirty' && u.movementType === 'wheel')
					? 2
					: 1
	) * t.drag
}

const notBlocked = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	concealed: ReadonlySet<number>
) =>
	!map.layers.units[tile] ||
	map.layers.units[tile]?.team === unit.team ||
	concealed.has(tile)

// Stops `route` at the first tile occupied by an enemy of `team`, returning the
// route up to (but not including) that tile and flagging the collision. Pathing
// only ever routes a unit through enemies it couldn't see (concealed by fog or
// stealth), so any enemy met mid-route is one the player walked into blind: the
// unit halts on the last clear tile and its turn ends. A clean route comes back
// unchanged with `collided: false`.
export const truncateRouteAtCollision = (
	map: MapObject,
	route: number[],
	team: number
): { route: number[]; collided: boolean } => {
	for (let i = 1; i < route.length; i++) {
		const occupant = map.layers.units[route[i]]
		if (occupant && occupant.team !== team) {
			return { route: route.slice(0, i), collided: true }
		}
	}
	return { route, collided: false }
}

export const validTerrain = (terrain: GroundObject, unit: UnitObject) => {
	const u = unitData[unit.type]
	const t = terrainData[terrain.type]
	if (u.movementType === 'none') return false
	if (t.details === 'impassable') return false
	if (u.type === 'air') return true
	if (t.name === 'Shore') return true
	// A High Bridge spans deep water: ground units cross the deck while ships pass
	// beneath it, so both are allowed (a plain Bridge sits low and blocks ships).
	if (t.name === 'High Bridge') return u.type === 'ground' || u.type === 'sea'
	if (t.ocean) return u.type === 'sea'
	return u.type === 'ground'
}

// Whether `unit` could legally occupy `terrain` — used by the map editor to reject
// nonsensical placements (a ground unit on the sea, a ship on grass, anything on a
// volcano, a tank on a mountain). It mirrors the in-match passability rules
// (`validTerrain`'s terrain gate plus the impassable `drag` check that `landTiles`
// relies on) but, unlike `validTerrain`, permits immobile units (Turrets, Blockades)
// which can never "move" yet still belong on the board.
export const canPlaceUnit = (terrain: GroundObject, unit: UnitObject, sky?: SkyObject | null) => {
	const u = unitData[unit.type]
	const t = terrainData[terrain.type]
	if (t.details === 'impassable') return false
	if (u.type === 'air') return true
	const terrainAllows =
		t.name === 'Shore'
			? true
			: t.name === 'High Bridge'
				? u.type === 'ground' || u.type === 'sea'
				: t.ocean
					? u.type === 'sea'
					: u.type === 'ground'
	if (!terrainAllows) return false
	// Even on type-compatible terrain, a unit's movement type may be unable to
	// traverse it (a tank on a mountain, a warship on a shore): an impassable move
	// cost means it could never stand there, so it can't be placed there either.
	return drag(unit, terrain, sky ?? undefined) < 100
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
