// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import {
	TRANSPORTER_TYPE,
	LEVIATHAN_TYPE,
	findFriendlyTransporters,
	transportLoad,
	canShipOut,
	shipOut,
	landTiles,
	landUnload,
	hasRescuedUnit,
} from '../../src/lib/Engine/modifiers/transport'

const STRIKE_COMMANDO = unitData.findIndex((u) => u.name === 'Strike Commando')
const HEAVY_COMMANDO = unitData.findIndex((u) => u.name === 'Heavy Commando')
const SCORPION_TANK = unitData.findIndex((u) => u.name === 'Scorpion Tank')

const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const FOREST = terrainData.findIndex((t) => t.name === 'Forest')
const MOUNTAIN = terrainData.findIndex((t) => t.name === 'Mountain')
const VOLCANO = terrainData.findIndex((t) => t.name === 'Volcano')
const SEA = terrainData.findIndex((t) => t.name === 'Sea')
const SHORE = terrainData.findIndex((t) => t.name === 'Shore')

const makeMap = (cols = 5, rows = 5, groundType = PLAINS): MapObject => ({
	cols,
	rows,
	layers: {
		ground: new Array(cols * rows).fill(0).map(() => ({ type: groundType, state: 0 })),
		sky: new Array(cols * rows).fill(null),
		units: new Array(cols * rows).fill(null),
		buildings: new Array(cols * rows).fill(null),
	},
	filters: {
		ground: () => [],
		sky: () => [],
		units: () => [],
		buildings: () => [],
	},
	route: new Array(cols * rows).fill(undefined),
	highlights: new Array(cols * rows).fill(undefined),
})

const unit = (type: number, team = 0, health?: number): UnitObject => ({
	type,
	state: 0,
	team,
	health: health ?? unitData[type].health,
})

const tileXY = (cols: number, x: number, y: number) => y * cols + x

describe('transport — load and unload', () => {
	it('finds friendly Transporters adjacent to a Commando', () => {
		const map = makeMap(5, 5)
		const commandoTile = tileXY(5, 2, 2)
		const transTile = tileXY(5, 3, 2)
		map.layers.units[commandoTile] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[transTile] = unit(TRANSPORTER_TYPE, 0)

		const result = findFriendlyTransporters(map, commandoTile, 0)
		expect(result).toEqual([transTile])
	})

	it('does not list an enemy Transporter as a load target', () => {
		const map = makeMap(5, 5)
		const commandoTile = tileXY(5, 2, 2)
		map.layers.units[commandoTile] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[tileXY(5, 3, 2)] = unit(TRANSPORTER_TYPE, 1)

		expect(findFriendlyTransporters(map, commandoTile, 0)).toEqual([])
	})

	it('does not list a Transporter that already holds a unit', () => {
		const map = makeMap(5, 5)
		const commandoTile = tileXY(5, 2, 2)
		const transTile = tileXY(5, 3, 2)
		map.layers.units[commandoTile] = unit(STRIKE_COMMANDO, 0)
		const occupied: UnitObject = unit(TRANSPORTER_TYPE, 0)
		occupied.rescuedUnit = unit(HEAVY_COMMANDO, 0)
		map.layers.units[transTile] = occupied

		expect(findFriendlyTransporters(map, commandoTile, 0)).toEqual([])
	})

	it('Transport: commando absorbed; transporter records rescuedUnit; HP ratio carried', () => {
		const map = makeMap(5, 5)
		const commandoTile = tileXY(5, 2, 2)
		const transTile = tileXY(5, 3, 2)
		const commandoMax = unitData[STRIKE_COMMANDO].health
		const transportMax = unitData[TRANSPORTER_TYPE].health
		const halfHP = Math.round(commandoMax / 2)

		const commando = unit(STRIKE_COMMANDO, 0, halfHP)
		map.layers.units[commandoTile] = commando
		map.layers.units[transTile] = unit(TRANSPORTER_TYPE, 0)

		const result = transportLoad(map, commandoTile, transTile)
		expect(result.ok).toBe(true)

		expect(map.layers.units[commandoTile]).toBeNull()
		const transport = map.layers.units[transTile]
		expect(transport).not.toBeNull()
		expect(transport?.type).toBe(TRANSPORTER_TYPE)
		expect(transport?.rescuedUnit).toBe(commando)

		const expectedHP = Math.max(1, Math.round((transportMax * halfHP) / commandoMax))
		expect(transport?.health).toBe(expectedHP)
	})

	it('Transport: refuses if commando does not have Transport modifier', () => {
		const map = makeMap(5, 5)
		const fromTile = tileXY(5, 2, 2)
		const transTile = tileXY(5, 3, 2)
		map.layers.units[fromTile] = unit(SCORPION_TANK, 0)
		map.layers.units[transTile] = unit(TRANSPORTER_TYPE, 0)

		const result = transportLoad(map, fromTile, transTile)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('cannot-transport')
	})

	it('Heavy Commando can also use Transport', () => {
		const map = makeMap(5, 5)
		const commandoTile = tileXY(5, 2, 2)
		const transTile = tileXY(5, 3, 2)
		map.layers.units[commandoTile] = unit(HEAVY_COMMANDO, 0)
		map.layers.units[transTile] = unit(TRANSPORTER_TYPE, 0)

		const result = transportLoad(map, commandoTile, transTile)
		expect(result.ok).toBe(true)
		expect(map.layers.units[transTile]?.rescuedUnit?.type).toBe(HEAVY_COMMANDO)
	})

	it('canShipOut: ground unit on Shore terrain returns true', () => {
		const map = makeMap(5, 5)
		const tile = tileXY(5, 2, 2)
		map.layers.ground[tile] = { type: SHORE, state: 0 }
		map.layers.units[tile] = unit(SCORPION_TANK, 0)
		expect(canShipOut(map, tile)).toBe(true)
	})

	it('canShipOut: ground unit on Plains returns false', () => {
		const map = makeMap(5, 5)
		const tile = tileXY(5, 2, 2)
		map.layers.units[tile] = unit(SCORPION_TANK, 0)
		expect(canShipOut(map, tile)).toBe(false)
	})

	it('Ship Out: ground unit on Shore → Leviathan with rescued unit in same tile', () => {
		const map = makeMap(5, 5)
		const tile = tileXY(5, 2, 2)
		map.layers.ground[tile] = { type: SHORE, state: 0 }
		const tank = unit(SCORPION_TANK, 0, 35)
		map.layers.units[tile] = tank

		const result = shipOut(map, tile)
		expect(result.ok).toBe(true)
		const lev = map.layers.units[tile]
		expect(lev?.type).toBe(LEVIATHAN_TYPE)
		expect(lev?.rescuedUnit).toBe(tank)
		expect(lev?.team).toBe(0)
		expect(hasRescuedUnit(lev)).toBe(true)
	})

	it('landTiles: returns adjacent passable tiles for rescued unit movement type', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		const transport = unit(TRANSPORTER_TYPE, 0)
		transport.rescuedUnit = unit(STRIKE_COMMANDO, 0)
		map.layers.units[transTile] = transport

		// volcano (impassable) to the east; foot can go everywhere else
		map.layers.ground[tileXY(5, 3, 2)] = { type: VOLCANO, state: 0 }

		const tiles = landTiles(map, transTile)
		expect(tiles).toContain(tileXY(5, 1, 2))
		expect(tiles).toContain(tileXY(5, 2, 1))
		expect(tiles).toContain(tileXY(5, 2, 3))
		expect(tiles).not.toContain(tileXY(5, 3, 2))
	})

	it('landTiles: excludes occupied tiles', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		const transport = unit(TRANSPORTER_TYPE, 0)
		transport.rescuedUnit = unit(STRIKE_COMMANDO, 0)
		map.layers.units[transTile] = transport
		map.layers.units[tileXY(5, 3, 2)] = unit(SCORPION_TANK, 0)

		const tiles = landTiles(map, transTile)
		expect(tiles).not.toContain(tileXY(5, 3, 2))
	})

	it('Land: rescued unit restored on adjacent valid tile; transport removed', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		const dest = tileXY(5, 2, 1)
		const rescuedMax = unitData[STRIKE_COMMANDO].health
		const transportMax = unitData[TRANSPORTER_TYPE].health

		const rescued = unit(STRIKE_COMMANDO, 0, rescuedMax)
		const transport = unit(TRANSPORTER_TYPE, 0, Math.round(transportMax / 2))
		transport.rescuedUnit = rescued
		map.layers.units[transTile] = transport

		const result = landUnload(map, transTile, dest)
		expect(result.ok).toBe(true)
		expect(map.layers.units[transTile]).toBeNull()
		const landed = map.layers.units[dest]
		expect(landed).toBe(rescued)
		expect(landed?.team).toBe(0)
		// transport at ~50% HP → rescued unit reduced proportionally
		const expectedHP = Math.max(
			1,
			Math.round((rescuedMax * Math.round(transportMax / 2)) / transportMax)
		)
		expect(landed?.health).toBe(expectedHP)
	})

	it('Land: refuses an invalid destination (not adjacent / impassable)', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		const transport = unit(TRANSPORTER_TYPE, 0)
		transport.rescuedUnit = unit(STRIKE_COMMANDO, 0)
		map.layers.units[transTile] = transport

		// volcano destination (impassable for foot)
		map.layers.ground[tileXY(5, 3, 2)] = { type: VOLCANO, state: 0 }
		const result = landUnload(map, transTile, tileXY(5, 3, 2))
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('invalid-destination')

		// far away tile
		const far = landUnload(map, transTile, tileXY(5, 4, 4))
		expect(far.ok).toBe(false)
	})

	it('Land: rejects when transport has no rescuedUnit', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		map.layers.units[transTile] = unit(TRANSPORTER_TYPE, 0)

		const result = landUnload(map, transTile, tileXY(5, 2, 1))
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('no-rescued')
	})

	it('Air transport delivers across forest and mountain (the whole point)', () => {
		// Build a row of forest and mountain tiles; foot units treat them as walkable
		// terrain via the air transport since the transporter is air (low-air).
		const map = makeMap(7, 3)
		// Row of mixed terrain in the middle row
		const row = 1
		map.layers.ground[tileXY(7, 1, row)] = { type: FOREST, state: 0 }
		map.layers.ground[tileXY(7, 2, row)] = { type: MOUNTAIN, state: 0 }
		map.layers.ground[tileXY(7, 3, row)] = { type: FOREST, state: 0 }
		map.layers.ground[tileXY(7, 4, row)] = { type: MOUNTAIN, state: 0 }

		const commandoStart = tileXY(7, 0, row)
		const transTile = tileXY(7, 0, row)
		const transportDelivery = tileXY(7, 4, row) // after flying across forest/mountain

		const commando = unit(STRIKE_COMMANDO, 0)
		map.layers.units[commandoStart] = commando

		// load the commando into a transporter that lands next to it
		map.layers.units[tileXY(7, 1, row)] = null
		map.layers.units[commandoStart] = null
		// place transporter at commando's old position with commando rescued
		const transport = unit(TRANSPORTER_TYPE, 0)
		transport.rescuedUnit = commando
		map.layers.units[transportDelivery] = transport

		// land on mountain tile (valid for foot)
		const landTarget = tileXY(7, 4, row)
		// pick an adjacent tile that's forest or mountain for the foot unit
		const adjacentMountain = tileXY(7, 3, row)
		const result = landUnload(map, landTarget, adjacentMountain)
		expect(result.ok).toBe(true)
		expect(map.layers.units[adjacentMountain]?.type).toBe(STRIKE_COMMANDO)
	})

	it('Land: refuses landing on Sea for a foot rescuedUnit', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		const transport = unit(TRANSPORTER_TYPE, 0)
		transport.rescuedUnit = unit(STRIKE_COMMANDO, 0)
		map.layers.units[transTile] = transport
		map.layers.ground[tileXY(5, 3, 2)] = { type: SEA, state: 0 }

		const result = landUnload(map, transTile, tileXY(5, 3, 2))
		expect(result.ok).toBe(false)
	})

	it('round-trip: Transport then Land restores commando with HP proportional', () => {
		const map = makeMap(5, 5)
		const commandoTile = tileXY(5, 2, 2)
		const transTile = tileXY(5, 3, 2)
		const landTile = tileXY(5, 3, 3)

		const commandoMax = unitData[STRIKE_COMMANDO].health
		const commando = unit(STRIKE_COMMANDO, 0, commandoMax)
		map.layers.units[commandoTile] = commando
		map.layers.units[transTile] = unit(TRANSPORTER_TYPE, 0)

		const load = transportLoad(map, commandoTile, transTile)
		expect(load.ok).toBe(true)
		expect(map.layers.units[commandoTile]).toBeNull()

		const land = landUnload(map, transTile, landTile)
		expect(land.ok).toBe(true)
		const landed = map.layers.units[landTile]
		expect(landed).toBe(commando)
		expect(landed?.health).toBe(commandoMax) // full HP round-trip
		expect(map.layers.units[transTile]).toBeNull()
	})
})
