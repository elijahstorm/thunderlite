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
	canAirLift,
	airLift,
	teamHasAirControl,
	landTiles,
	landUnload,
	hasRescuedUnit,
} from '../../src/lib/Engine/modifiers/transport'
import { buildingData } from '../../src/lib/GameData/building'

const AIR_CONTROL = buildingData.findIndex((b) => b.name === 'Air Control')
const CITY = buildingData.findIndex((b) => b.name === 'City')

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

	it('landTiles: returns the transport own tile when it is passable for the rescued unit', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		const transport = unit(TRANSPORTER_TYPE, 0)
		transport.rescuedUnit = unit(STRIKE_COMMANDO, 0)
		map.layers.units[transTile] = transport

		// plains under the transport — a foot unit can stand here, so it lands in place
		expect(landTiles(map, transTile)).toEqual([transTile])
	})

	it('landTiles: returns [] when the transport own tile is impassable for the rescued unit', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		const transport = unit(TRANSPORTER_TYPE, 0)
		transport.rescuedUnit = unit(STRIKE_COMMANDO, 0)
		map.layers.units[transTile] = transport

		// volcano underneath — impassable for foot, so there's nowhere to land
		map.layers.ground[transTile] = { type: VOLCANO, state: 0 }
		expect(landTiles(map, transTile)).toEqual([])
	})

	it('Land: rescued unit restored on the transport own tile; transport replaced', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		const rescuedMax = unitData[STRIKE_COMMANDO].health
		const transportMax = unitData[TRANSPORTER_TYPE].health

		const rescued = unit(STRIKE_COMMANDO, 0, rescuedMax)
		const transport = unit(TRANSPORTER_TYPE, 0, Math.round(transportMax / 2))
		transport.rescuedUnit = rescued
		map.layers.units[transTile] = transport

		const result = landUnload(map, transTile, transTile)
		expect(result.ok).toBe(true)
		const landed = map.layers.units[transTile]
		expect(landed).toBe(rescued)
		expect(landed?.team).toBe(0)
		// transport at ~50% HP → rescued unit reduced proportionally
		const expectedHP = Math.max(
			1,
			Math.round((rescuedMax * Math.round(transportMax / 2)) / transportMax)
		)
		expect(landed?.health).toBe(expectedHP)
	})

	it('Land: refuses any destination other than the transport own tile', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		const transport = unit(TRANSPORTER_TYPE, 0)
		transport.rescuedUnit = unit(STRIKE_COMMANDO, 0)
		map.layers.units[transTile] = transport

		// an adjacent tile is no longer a legal drop — landing only happens in place
		const adjacent = landUnload(map, transTile, tileXY(5, 2, 1))
		expect(adjacent.ok).toBe(false)
		if (!adjacent.ok) expect(adjacent.reason).toBe('invalid-destination')

		// far away tile
		const far = landUnload(map, transTile, tileXY(5, 4, 4))
		expect(far.ok).toBe(false)
	})

	it('Land: refuses when the transport own tile is impassable for the rescued unit', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		const transport = unit(TRANSPORTER_TYPE, 0)
		transport.rescuedUnit = unit(STRIKE_COMMANDO, 0)
		map.layers.units[transTile] = transport

		// volcano underneath — impassable for foot
		map.layers.ground[transTile] = { type: VOLCANO, state: 0 }
		const result = landUnload(map, transTile, transTile)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('invalid-destination')
	})

	it('Land: rejects when transport has no rescuedUnit', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		map.layers.units[transTile] = unit(TRANSPORTER_TYPE, 0)

		const result = landUnload(map, transTile, transTile)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('no-rescued')
	})

	it('Air transport delivers across forest and mountain (the whole point)', () => {
		// A paraglider flies over forest/mountain and sets its foot passenger down on
		// the mountain tile it ends on — terrain a foot unit can stand on (just crosses
		// slowly), which is exactly what the air transport is for.
		const map = makeMap(7, 3)
		const row = 1
		const mountainTile = tileXY(7, 4, row)
		map.layers.ground[mountainTile] = { type: MOUNTAIN, state: 0 }

		const commando = unit(STRIKE_COMMANDO, 0)
		const transport = unit(TRANSPORTER_TYPE, 0)
		transport.rescuedUnit = commando
		map.layers.units[mountainTile] = transport

		const result = landUnload(map, mountainTile, mountainTile)
		expect(result.ok).toBe(true)
		expect(map.layers.units[mountainTile]?.type).toBe(STRIKE_COMMANDO)
	})

	it('Land: refuses landing on Sea for a foot rescuedUnit', () => {
		const map = makeMap(5, 5)
		const transTile = tileXY(5, 2, 2)
		const transport = unit(TRANSPORTER_TYPE, 0)
		transport.rescuedUnit = unit(STRIKE_COMMANDO, 0)
		map.layers.units[transTile] = transport
		// the transport sits over open sea — a foot unit can't disembark here
		map.layers.ground[transTile] = { type: SEA, state: 0 }

		const result = landUnload(map, transTile, transTile)
		expect(result.ok).toBe(false)
	})

	const building = (type: number, team = 0) => ({ type, state: 0, team })

	it('teamHasAirControl: true only when the team owns an Air Control', () => {
		const map = makeMap(5, 5)
		expect(teamHasAirControl(map, 0)).toBe(false)
		map.layers.buildings[tileXY(5, 0, 0)] = building(AIR_CONTROL, 0)
		expect(teamHasAirControl(map, 0)).toBe(true)
		// owned by the enemy → still false for team 0
		expect(teamHasAirControl(map, 1)).toBe(false)
	})

	it('teamHasAirControl: a City (no Allow_Air) does not count', () => {
		const map = makeMap(5, 5)
		map.layers.buildings[tileXY(5, 0, 0)] = building(CITY, 0)
		expect(teamHasAirControl(map, 0)).toBe(false)
	})

	it('canAirLift: commando with an Air Control may air-lift anywhere (no shore needed)', () => {
		const map = makeMap(5, 5)
		const tile = tileXY(5, 2, 2)
		map.layers.units[tile] = unit(STRIKE_COMMANDO, 0)
		// no Air Control yet
		expect(canAirLift(map, tile)).toBe(false)
		map.layers.buildings[tileXY(5, 0, 0)] = building(AIR_CONTROL, 0)
		expect(canAirLift(map, tile)).toBe(true)
	})

	it('canAirLift: refuses a non-commando even with an Air Control', () => {
		const map = makeMap(5, 5)
		const tile = tileXY(5, 2, 2)
		map.layers.units[tile] = unit(SCORPION_TANK, 0)
		map.layers.buildings[tileXY(5, 0, 0)] = building(AIR_CONTROL, 0)
		expect(canAirLift(map, tile)).toBe(false)
	})

	it('Air Lift: commando → Transporter carrying itself in the same tile', () => {
		const map = makeMap(5, 5)
		const tile = tileXY(5, 2, 2)
		const commandoMax = unitData[STRIKE_COMMANDO].health
		const transportMax = unitData[TRANSPORTER_TYPE].health
		const commando = unit(HEAVY_COMMANDO, 0, commandoMax)
		map.layers.units[tile] = commando
		map.layers.buildings[tileXY(5, 0, 0)] = building(AIR_CONTROL, 0)

		const result = airLift(map, tile)
		expect(result.ok).toBe(true)
		const transport = map.layers.units[tile]
		expect(transport?.type).toBe(TRANSPORTER_TYPE)
		expect(transport?.rescuedUnit).toBe(commando)
		expect(transport?.team).toBe(0)
		expect(transport?.health).toBe(transportMax) // full commando → full carrier
	})

	it('Air Lift: refused without an Air Control', () => {
		const map = makeMap(5, 5)
		const tile = tileXY(5, 2, 2)
		map.layers.units[tile] = unit(STRIKE_COMMANDO, 0)
		const result = airLift(map, tile)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('cannot-air-lift')
	})

	it('Air Lift then Land: paraglider drops the commando back in place onto land, not sea', () => {
		const map = makeMap(5, 5)
		const tile = tileXY(5, 2, 2)
		map.layers.units[tile] = unit(STRIKE_COMMANDO, 0)
		map.layers.buildings[tileXY(5, 0, 0)] = building(AIR_CONTROL, 0)
		expect(airLift(map, tile).ok).toBe(true)

		// over open sea the commando can't come down...
		map.layers.ground[tile] = { type: SEA, state: 0 }
		expect(landUnload(map, tile, tile).ok).toBe(false)

		// ...but over passable ground it lands in place
		map.layers.ground[tile] = { type: PLAINS, state: 0 }
		expect(landUnload(map, tile, tile).ok).toBe(true)
		expect(map.layers.units[tile]?.type).toBe(STRIKE_COMMANDO)
	})

	it('round-trip: Transport then Land restores commando with HP proportional', () => {
		const map = makeMap(5, 5)
		const commandoTile = tileXY(5, 2, 2)
		const transTile = tileXY(5, 3, 2)

		const commandoMax = unitData[STRIKE_COMMANDO].health
		const commando = unit(STRIKE_COMMANDO, 0, commandoMax)
		map.layers.units[commandoTile] = commando
		map.layers.units[transTile] = unit(TRANSPORTER_TYPE, 0)

		const load = transportLoad(map, commandoTile, transTile)
		expect(load.ok).toBe(true)
		expect(map.layers.units[commandoTile]).toBeNull()

		// the transporter disembarks the commando onto its own tile
		const land = landUnload(map, transTile, transTile)
		expect(land.ok).toBe(true)
		const landed = map.layers.units[transTile]
		expect(landed).toBe(commando)
		expect(landed?.health).toBe(commandoMax) // full HP round-trip
	})
})
