// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { gameState, resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import {
	clearModifierRegistry,
	registerModifier,
	runModifiers,
	type ModifierContext,
} from '../../src/lib/Engine/modifiers'
import { unitData } from '../../src/lib/GameData/unit'
import { modifierData } from '../../src/lib/GameData/modifier'

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

const unit = (team: number, type = 0, health?: number): UnitObject => ({
	type,
	state: 0,
	team,
	...(typeof health === 'number' ? { health } : {}),
})
const building = (team: number, type = 0): BuildingObject => ({ type, state: 0, team })

const COMMAND_CENTER_TYPE = 0
const STRIKE_COMMANDO_TYPE = 0

describe('modifierData record shape', () => {
	it('every modifier resolves to a typed record with a phase', () => {
		for (const key of Object.keys(modifierData) as (keyof typeof modifierData)[]) {
			const record = modifierData[key]
			expect(record).toBeTruthy()
			expect(typeof record.phase).toBe('string')
		}
	})

	it("declares 'Start_Turn.Heal_Team' with a built-in run handler", () => {
		const record = modifierData['Start_Turn.Heal_Team']
		expect(record.phase).toBe('Start_Turn')
		expect(typeof record.run).toBe('function')
	})

	it('routes a key without a phase prefix (e.g. Extra_Sight) to Properties', () => {
		expect(modifierData.Extra_Sight.phase).toBe('Properties')
		expect(modifierData.Trench.phase).toBe('Properties')
	})
})

describe('runModifiers dispatcher', () => {
	beforeEach(() => {
		resetGameState()
		clearModifierRegistry()
	})

	const ctx = (kind: 'unit' | 'building', tile = 0): ModifierContext => ({
		kind,
		tile,
		state: get(gameState),
	})

	it('uses the phase from the modifier record rather than the key prefix', () => {
		const calls: string[] = []
		// Strike Commando declares 'Self_Action.Repairable' — should only fire in Self_Action.
		registerModifier('Self_Action.Repairable', () => calls.push('repairable'))

		runModifiers(unit(0, STRIKE_COMMANDO_TYPE), 'Start_Turn', ctx('unit'))
		expect(calls).toEqual([])

		runModifiers(unit(0, STRIKE_COMMANDO_TYPE), 'Self_Action', ctx('unit'))
		expect(calls).toEqual(['repairable'])
	})

	it('invokes handlers in declared modifier order on the target', () => {
		const calls: string[] = []
		// Strike Commando declares Transport before Repairable.
		registerModifier('Self_Action.Repairable', () => calls.push('repairable'))
		registerModifier('Self_Action.Transport', () => calls.push('transport'))

		runModifiers(unit(0, STRIKE_COMMANDO_TYPE), 'Self_Action', ctx('unit'))
		expect(calls).toEqual(['transport', 'repairable'])
	})

	it('does not throw when no handler is registered for a declared modifier', () => {
		expect(() =>
			runModifiers(unit(0, STRIKE_COMMANDO_TYPE), 'Start_Turn', ctx('unit'))
		).not.toThrow()
	})

	it('runs both the built-in run and any registered handlers, built-in first', () => {
		const calls: string[] = []
		const map = makeMap()
		map.layers.buildings[0] = building(0, COMMAND_CENTER_TYPE)
		// Wounded friendly unit colocated with the Command Center.
		map.layers.units[0] = unit(0, STRIKE_COMMANDO_TYPE, 10)
		initGameStateFromMap(map)

		registerModifier('Start_Turn.Heal_Team', () => calls.push('registered'))

		const state = get(gameState)
		runModifiers(map.layers.buildings[0]!, 'Start_Turn', {
			kind: 'building',
			tile: 0,
			state,
			map,
		})

		// built-in healed the unit, then the registered handler fired
		expect(map.layers.units[0]!.health).toBe(20)
		expect(calls).toEqual(['registered'])
	})

	it('skips modifiers whose record phase does not match', () => {
		const calls: string[] = []
		// Stealth Tank declares only End_Turn.Cloak + Self_Action.Repairable.
		registerModifier('End_Turn.Cloak', () => calls.push('cloak'))
		runModifiers(unit(0, 6), 'Start_Turn', ctx('unit'))
		expect(calls).toEqual([])
		runModifiers(unit(0, 6), 'End_Turn', ctx('unit'))
		expect(calls).toEqual(['cloak'])
	})
})

describe('Start_Turn.Heal_Team handler', () => {
	beforeEach(() => {
		resetGameState()
		clearModifierRegistry()
	})

	const runHeal = (map: MapProcesser, tile: number) => {
		const state = get(gameState)
		runModifiers(map.layers.buildings[tile]!, 'Start_Turn', {
			kind: 'building',
			tile,
			state,
			map,
		})
	}

	it('heals a wounded friendly unit standing on a Command Center by +10 HP', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(1, COMMAND_CENTER_TYPE)
		map.layers.units[5] = unit(1, STRIKE_COMMANDO_TYPE, 20)
		initGameStateFromMap(map)

		runHeal(map, 5)

		expect(map.layers.units[5]!.health).toBe(30)
	})

	it('caps at max HP when healing would overshoot', () => {
		const map = makeMap()
		const maxHp = unitData[STRIKE_COMMANDO_TYPE].health
		map.layers.buildings[5] = building(1, COMMAND_CENTER_TYPE)
		map.layers.units[5] = unit(1, STRIKE_COMMANDO_TYPE, maxHp - 3)
		initGameStateFromMap(map)

		runHeal(map, 5)

		expect(map.layers.units[5]!.health).toBe(maxHp)
	})

	it('does not heal enemy units standing on the Command Center', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(1, COMMAND_CENTER_TYPE)
		map.layers.units[5] = unit(0, STRIKE_COMMANDO_TYPE, 20)
		initGameStateFromMap(map)

		runHeal(map, 5)

		expect(map.layers.units[5]!.health).toBe(20)
	})

	it('is safe when no unit is on the Command Center', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(1, COMMAND_CENTER_TYPE)
		initGameStateFromMap(map)

		expect(() => runHeal(map, 5)).not.toThrow()
		expect(map.layers.units[5]).toBeNull()
	})

	it('leaves a full-HP unit untouched (no health field mutated)', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(1, COMMAND_CENTER_TYPE)
		// No health field — treat as full.
		map.layers.units[5] = unit(1, STRIKE_COMMANDO_TYPE)
		initGameStateFromMap(map)

		runHeal(map, 5)

		expect(map.layers.units[5]!.health).toBeUndefined()
	})

	it('no-ops safely when ctx.map is undefined', () => {
		const state = get(gameState)
		expect(() =>
			runModifiers(building(1, COMMAND_CENTER_TYPE), 'Start_Turn', {
				kind: 'building',
				tile: 0,
				state,
			})
		).not.toThrow()
	})
})
