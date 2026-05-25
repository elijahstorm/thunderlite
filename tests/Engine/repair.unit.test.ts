// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import {
	gameState,
	resetGameState,
	initGameStateFromMap,
} from '../../src/lib/Engine/gameState'
import { repair, canRepair, REPAIR_RATIO } from '../../src/lib/Engine/modifiers/repair'
import { computeAvailableActions } from '../../src/lib/Engine/actions'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'

const SCORPION_TANK = unitData.findIndex((u) => u.name === 'Scorpion Tank')
const RAPTOR_FIGHTER = unitData.findIndex((u) => u.name === 'Raptor Fighter')
const BLOCKADE = unitData.findIndex((u) => u.name === 'Blockade')
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')

const makeMap = (): MapObject => ({
	cols: 5,
	rows: 5,
	layers: {
		ground: new Array(25).fill(0).map(() => ({ type: PLAINS, state: 0 })),
		sky: new Array(25).fill(null),
		units: new Array(25).fill(null),
		buildings: new Array(25).fill(null),
	},
	highlights: [],
	route: [],
	filters: {} as any,
}) as MapObject

const unit = (type: number, team: number, health: number): UnitObject => ({
	type,
	state: 0,
	team,
	health,
})

describe('repair.canRepair', () => {
	it('true for a wounded Repairable unit', () => {
		const max = unitData[SCORPION_TANK].health
		expect(canRepair(unit(SCORPION_TANK, 0, max - 10))).toBe(true)
	})

	it('false at full health', () => {
		const max = unitData[SCORPION_TANK].health
		expect(canRepair(unit(SCORPION_TANK, 0, max))).toBe(false)
	})

	it('false for Irreparable units (Raptor Fighter)', () => {
		expect(canRepair(unit(RAPTOR_FIGHTER, 0, 10))).toBe(false)
	})

	it('false for Irreparable units (Blockade)', () => {
		expect(canRepair(unit(BLOCKADE, 0, 10))).toBe(false)
	})
})

describe('repair.repair', () => {
	beforeEach(() => {
		resetGameState()
	})

	it('Wounded Scorpion Tank gains 25% of max HP', () => {
		const map = makeMap()
		const max = unitData[SCORPION_TANK].health
		const tank = unit(SCORPION_TANK, 0, 10)
		map.layers.units[12] = tank
		initGameStateFromMap(map)

		const result = repair(map, 12, 0)
		expect(result.ok).toBe(true)
		const expected = 10 + Math.round(max * REPAIR_RATIO)
		expect(tank.health).toBe(expected)
		if (result.ok) {
			expect(result.newHealth).toBe(expected)
			expect(result.healed).toBe(Math.round(max * REPAIR_RATIO))
		}
	})

	it('clamps to max HP when 25% would exceed', () => {
		const map = makeMap()
		const max = unitData[SCORPION_TANK].health
		const tank = unit(SCORPION_TANK, 0, max - 1)
		map.layers.units[12] = tank
		initGameStateFromMap(map)

		const result = repair(map, 12, 0)
		expect(result.ok).toBe(true)
		expect(tank.health).toBe(max)
		if (result.ok) expect(result.healed).toBe(1)
	})

	it('marks the tile as acted (consumes the unit\'s action)', () => {
		const map = makeMap()
		const tank = unit(SCORPION_TANK, 0, 10)
		map.layers.units[12] = tank
		initGameStateFromMap(map)

		repair(map, 12, 0)
		expect(get(gameState).actedTiles.has(12)).toBe(true)
	})

	it('produces integer HP', () => {
		const map = makeMap()
		const max = unitData[SCORPION_TANK].health
		const tank = unit(SCORPION_TANK, 0, max - 7)
		map.layers.units[12] = tank
		initGameStateFromMap(map)

		repair(map, 12, 0)
		expect(Number.isInteger(tank.health)).toBe(true)
	})

	it('refuses on Irreparable units (Raptor Fighter)', () => {
		const map = makeMap()
		const raptor = unit(RAPTOR_FIGHTER, 0, 10)
		map.layers.units[12] = raptor
		initGameStateFromMap(map)

		const result = repair(map, 12, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('not-repairable')
		expect(raptor.health).toBe(10)
		expect(get(gameState).actedTiles.has(12)).toBe(false)
	})

	it('refuses when no unit is on the tile', () => {
		const map = makeMap()
		const tank = unit(SCORPION_TANK, 0, 10)
		map.layers.units[5] = tank
		initGameStateFromMap(map)

		const result = repair(map, 12, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('no-unit')
	})

	it('refuses when unit belongs to a different team', () => {
		const map = makeMap()
		const tank = unit(SCORPION_TANK, 1, 10)
		map.layers.units[12] = tank
		initGameStateFromMap(map)

		const result = repair(map, 12, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('wrong-team')
	})

	it('refuses when unit is already at full health', () => {
		const map = makeMap()
		const max = unitData[SCORPION_TANK].health
		const tank = unit(SCORPION_TANK, 0, max)
		map.layers.units[12] = tank
		initGameStateFromMap(map)

		const result = repair(map, 12, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('at-full-health')
	})
})

describe('action menu gating for Repair', () => {
	it('Irreparable Raptor Fighter does NOT show Repair', () => {
		const map = makeMap()
		const raptor = unit(RAPTOR_FIGHTER, 0, 10)
		map.layers.units[12] = raptor
		const items = computeAvailableActions({ map, tile: 12, unit: raptor })
		expect(items.find((i) => i.id === 'repair')).toBeUndefined()
	})

	it('Irreparable Blockade does NOT show Repair', () => {
		const map = makeMap()
		const blockade = unit(BLOCKADE, 0, 10)
		map.layers.units[12] = blockade
		const items = computeAvailableActions({ map, tile: 12, unit: blockade })
		expect(items.find((i) => i.id === 'repair')).toBeUndefined()
	})

	it('Wounded Scorpion Tank shows Repair enabled', () => {
		const map = makeMap()
		const tank = unit(SCORPION_TANK, 0, 10)
		map.layers.units[12] = tank
		const items = computeAvailableActions({ map, tile: 12, unit: tank })
		const r = items.find((i) => i.id === 'repair')
		expect(r).toBeDefined()
		expect(r?.enabled).toBe(true)
	})
})
