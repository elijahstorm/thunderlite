// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { gameState, resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { endTurn } from '../../src/lib/Engine/turnLoop'
import {
	clearModifierRegistry,
	runModifiers,
	type ModifierContext,
} from '../../src/lib/Engine/modifiers'
import { buildingData } from '../../src/lib/GameData/building'

const CITY_TYPE = buildingData.findIndex((b) => b.name === 'City')
const OIL_REFINERY_TYPE = buildingData.findIndex((b) => b.name === 'Oil Refinery')
const OIL_RIG_TYPE = buildingData.findIndex((b) => b.name === 'Oil Rig')
const COMMAND_CENTER_TYPE = buildingData.findIndex((b) => b.name === 'Command Center')

const makeMap = (overrides: Partial<MapProcesser> = {}): MapProcesser => ({
	cols: 4,
	rows: 4,
	layers: {
		ground: new Array(16).fill(0).map(() => ({ type: 0, state: 0 })),
		sky: new Array(16).fill(null),
		units: new Array(16).fill(null),
		buildings: new Array(16).fill(null),
	},
	...overrides,
})

const unit = (team: number, type = 0): UnitObject => ({ type, state: 0, team })
const building = (team: number, type: number): BuildingObject => ({
	type,
	state: 0,
	team,
})

const moneyOf = (team: number): number =>
	get(gameState).players.find((p) => p.team === team)?.money ?? 0

describe('Each_Turn.Supply_Income via endTurn', () => {
	beforeEach(() => {
		resetGameState()
		clearModifierRegistry()
	})

	it('a single owned City pays 120 to its owner after one full round', () => {
		const map = makeMap()
		// Single player so endTurn wraps back to team 0 and runs Each_Turn for team 0.
		map.layers.units[0] = unit(0)
		map.layers.buildings[0] = building(0, CITY_TYPE)
		initGameStateFromMap(map)

		expect(moneyOf(0)).toBe(0)

		endTurn({ map })

		expect(moneyOf(0)).toBe(120)
	})

	it('one City + one Oil Refinery owned by the player yields 180 in one round', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.buildings[0] = building(0, CITY_TYPE)
		map.layers.buildings[1] = building(0, OIL_REFINERY_TYPE)
		initGameStateFromMap(map)

		endTurn({ map })

		expect(moneyOf(0)).toBe(180)
	})

	it('one City + one Oil Rig yields 240', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.buildings[0] = building(0, CITY_TYPE)
		map.layers.buildings[1] = building(0, OIL_RIG_TYPE)
		initGameStateFromMap(map)

		endTurn({ map })

		expect(moneyOf(0)).toBe(240)
	})

	it('only pays income to the player whose turn is starting, not the outgoing team', () => {
		const map = makeMap()
		// Both teams own a City. End team 0's turn → team 1 starts → only team 1 collects.
		map.layers.units[0] = unit(0)
		map.layers.units[2] = unit(1)
		map.layers.buildings[0] = building(0, CITY_TYPE)
		map.layers.buildings[1] = building(1, CITY_TYPE)
		initGameStateFromMap(map)

		endTurn({ map })

		expect(moneyOf(0)).toBe(0)
		expect(moneyOf(1)).toBe(120)
	})

	it('does not pay income for enemy buildings (different team)', () => {
		const map = makeMap()
		// team 0's turn ends — team 0's only buildings are enemy-owned.
		map.layers.units[0] = unit(0)
		map.layers.units[2] = unit(1)
		map.layers.buildings[0] = building(1, CITY_TYPE)
		initGameStateFromMap(map)

		endTurn({ map })

		// Team 1 collected its City income.
		expect(moneyOf(1)).toBe(120)
		expect(moneyOf(0)).toBe(0)
	})

	it('skips neutral buildings with no team (no owner = no income)', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		// Neutral City: team field omitted (mirrors editor's "place building with no team")
		map.layers.buildings[1] = { type: CITY_TYPE, state: 0 } as unknown as BuildingObject
		initGameStateFromMap(map)

		endTurn({ map })

		expect(moneyOf(0)).toBe(0)
	})

	it('non-income buildings (Command Center) do not pay out', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.buildings[0] = building(0, COMMAND_CENTER_TYPE)
		initGameStateFromMap(map)

		endTurn({ map })

		expect(moneyOf(0)).toBe(0)
	})

	it('compounds across multiple rounds', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.buildings[0] = building(0, CITY_TYPE)
		initGameStateFromMap(map)

		endTurn({ map })
		endTurn({ map })
		endTurn({ map })

		expect(moneyOf(0)).toBe(360)
	})
})

describe('supplyIncome handler direct dispatch', () => {
	beforeEach(() => {
		resetGameState()
		clearModifierRegistry()
	})

	it('directly running the modifier on a City credits the owner', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.buildings[0] = building(0, CITY_TYPE)
		initGameStateFromMap(map)

		const ctx: ModifierContext = {
			kind: 'building',
			tile: 0,
			state: get(gameState),
			map,
		}
		runModifiers(map.layers.buildings[0]!, 'Each_Turn', ctx)

		expect(moneyOf(0)).toBe(120)
	})
})
