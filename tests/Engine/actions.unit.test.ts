// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeAvailableActions } from '../../src/lib/Engine/actions'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

const STRIKE_COMMANDO = unitData.findIndex((u) => u.name === 'Strike Commando')
const SCORPION_TANK = unitData.findIndex((u) => u.name === 'Scorpion Tank')
const WARMACHINE = unitData.findIndex((u) => u.name === 'Warmachine')
const CITY = buildingData.findIndex((b) => b.name === 'City')
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const ENRICHED_ORE = terrainData.findIndex((t) => t.name === 'Enriched Ore Deposit')

const makeMap = (groundType = PLAINS): MapObject => ({
	cols: 5,
	rows: 5,
	layers: {
		ground: new Array(25).fill(0).map(() => ({ type: groundType, state: 0 })),
		sky: new Array(25).fill(null),
		units: new Array(25).fill(null),
		buildings: new Array(25).fill(null),
	},
	highlights: [],
	route: [],
	filters: {} as any,
}) as MapObject

const unit = (type: number, team: number, health?: number): UnitObject => ({
	type,
	state: 0,
	team,
	health: health ?? unitData[type].health,
})

const ids = (items: ReturnType<typeof computeAvailableActions>) => items.map((i) => i.id)

describe('computeAvailableActions', () => {
	it('always includes Wait', () => {
		const map = makeMap()
		const u = unit(STRIKE_COMMANDO, 0)
		map.layers.units[12] = u
		const items = computeAvailableActions({ map, tile: 12, unit: u })
		expect(ids(items)).toContain('wait')
	})

	it('Strike Commando standing on enemy City shows Capture + Wait', () => {
		const map = makeMap()
		const u = unit(STRIKE_COMMANDO, 0)
		map.layers.units[12] = u
		map.layers.buildings[12] = { type: CITY, state: 0, team: 1 }
		const items = computeAvailableActions({ map, tile: 12, unit: u })
		expect(ids(items)).toEqual(expect.arrayContaining(['capture', 'wait']))
		expect(ids(items)).not.toContain('attack')
	})

	it('Strike Commando standing on own City does NOT show Capture', () => {
		const map = makeMap()
		const u = unit(STRIKE_COMMANDO, 0)
		map.layers.units[12] = u
		map.layers.buildings[12] = { type: CITY, state: 0, team: 0 }
		const items = computeAvailableActions({ map, tile: 12, unit: u })
		expect(ids(items)).not.toContain('capture')
	})

	it('Scorpion Tank adjacent to an enemy shows Attack + Wait', () => {
		const map = makeMap()
		const tank = unit(SCORPION_TANK, 0)
		const enemy = unit(STRIKE_COMMANDO, 1)
		map.layers.units[12] = tank
		map.layers.units[13] = enemy
		const items = computeAvailableActions({ map, tile: 12, unit: tank })
		expect(ids(items)).toEqual(expect.arrayContaining(['attack', 'wait']))
	})

	it('Scorpion Tank with no enemies in range shows only Wait', () => {
		const map = makeMap()
		const tank = unit(SCORPION_TANK, 0)
		map.layers.units[12] = tank
		const items = computeAvailableActions({ map, tile: 12, unit: tank })
		expect(ids(items)).toEqual(['wait'])
	})

	it('Warmachine on Enriched Ore Deposit shows Mine + Build + Wait', () => {
		const map = makeMap()
		const w = unit(WARMACHINE, 0)
		map.layers.ground[12].type = ENRICHED_ORE
		map.layers.units[12] = w
		const items = computeAvailableActions({ map, tile: 12, unit: w })
		expect(ids(items)).toEqual(expect.arrayContaining(['mine', 'build', 'wait']))
	})

	it('Warmachine on plains shows Build but not Mine', () => {
		const map = makeMap()
		const w = unit(WARMACHINE, 0)
		map.layers.units[12] = w
		const items = computeAvailableActions({ map, tile: 12, unit: w })
		expect(ids(items)).toContain('build')
		expect(ids(items)).not.toContain('mine')
	})

	it('Damaged unit with Self_Action.Repairable shows Repair (disabled, G4 pending)', () => {
		const map = makeMap()
		const u = unit(SCORPION_TANK, 0, 10)
		map.layers.units[12] = u
		const items = computeAvailableActions({ map, tile: 12, unit: u })
		const repair = items.find((i) => i.id === 'repair')
		expect(repair).toBeDefined()
		expect(repair?.enabled).toBe(false)
		expect(repair?.reason).toMatch(/G4|Repair/)
	})

	it('Full-HP unit does not show Repair', () => {
		const map = makeMap()
		const u = unit(SCORPION_TANK, 0)
		map.layers.units[12] = u
		const items = computeAvailableActions({ map, tile: 12, unit: u })
		expect(ids(items)).not.toContain('repair')
	})

	it('Strike Commando on enemy City with adjacent enemy shows Capture + Attack + Wait', () => {
		const map = makeMap()
		const u = unit(STRIKE_COMMANDO, 0)
		const enemy = unit(STRIKE_COMMANDO, 1)
		map.layers.units[12] = u
		map.layers.units[13] = enemy
		map.layers.buildings[12] = { type: CITY, state: 0, team: 1 }
		const items = computeAvailableActions({ map, tile: 12, unit: u })
		expect(ids(items)).toEqual(expect.arrayContaining(['attack', 'capture', 'wait']))
	})
})
