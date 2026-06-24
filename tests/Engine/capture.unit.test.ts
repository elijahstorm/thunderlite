// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import {
	gameState,
	resetGameState,
	initGameStateFromMap,
	NEUTRAL_TEAM,
} from '../../src/lib/Engine/gameState'
import { endTurn } from '../../src/lib/Engine/turnLoop'
import {
	clearModifierRegistry,
	runModifiers,
	type ModifierContext,
} from '../../src/lib/Engine/modifiers'
import { buildingData } from '../../src/lib/GameData/building'
import { unitData } from '../../src/lib/GameData/unit'

const CITY_TYPE = buildingData.findIndex((b) => b.name === 'City')
const COMMAND_CENTER_TYPE = buildingData.findIndex((b) => b.name === 'Command Center')
const GROUND_CONTROL_TYPE = buildingData.findIndex((b) => b.name === 'Ground Control')
const AIR_CONTROL_TYPE = buildingData.findIndex((b) => b.name === 'Air Control')

const STRIKE_COMMANDO_TYPE = unitData.findIndex((u) => u.name === 'Strike Commando')
const STRIKE_MAX_HP = unitData[STRIKE_COMMANDO_TYPE].health

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

const unit = (team: number, type = STRIKE_COMMANDO_TYPE, health?: number): UnitObject => ({
	type,
	state: 0,
	team,
	...(typeof health === 'number' ? { health } : {}),
})

const building = (team: number, type: number, stature?: number): BuildingObject => ({
	type,
	state: 0,
	team,
	...(typeof stature === 'number' ? { stature } : {}),
})

const controlsOf = (team: number) => get(gameState).players.find((p) => p.team === team)?.controls

const runCaptureFor = (map: MapProcesser, tile: number) => {
	const ctx: ModifierContext = {
		kind: 'unit',
		tile,
		state: get(gameState),
		map,
	}
	runModifiers(map.layers.units[tile]!, 'Start_Turn', ctx)
}

describe('Start_Turn.Capture handler', () => {
	beforeEach(() => {
		resetGameState()
		clearModifierRegistry()
	})

	it('a full-HP Strike Commando reduces enemy City stature by 10 per start-of-turn; flips after 2 turns', () => {
		const map = makeMap()
		map.layers.units[5] = unit(0)
		map.layers.buildings[5] = building(1, CITY_TYPE)
		initGameStateFromMap(map)

		const max = buildingData[CITY_TYPE].stature

		runCaptureFor(map, 5)
		expect(map.layers.buildings[5]!.stature).toBe(max - 10)
		expect(map.layers.buildings[5]!.team).toBe(1)

		runCaptureFor(map, 5)
		expect(map.layers.buildings[5]!.team).toBe(0)
		expect(map.layers.buildings[5]!.stature).toBe(max)
	})

	it('captures a neutral building (no team) when no owner is set', () => {
		const map = makeMap()
		map.layers.units[3] = unit(0)
		map.layers.buildings[3] = { type: CITY_TYPE, state: 0 } as unknown as BuildingObject
		initGameStateFromMap(map)

		const max = buildingData[CITY_TYPE].stature

		runCaptureFor(map, 3)
		expect(map.layers.buildings[3]!.stature).toBe(max - 10)

		runCaptureFor(map, 3)
		expect(map.layers.buildings[3]!.team).toBe(0)
	})

	it('a half-HP unit captures at half speed (reduction of 5)', () => {
		const map = makeMap()
		map.layers.units[5] = unit(0, STRIKE_COMMANDO_TYPE, STRIKE_MAX_HP / 2)
		map.layers.buildings[5] = building(1, CITY_TYPE)
		initGameStateFromMap(map)

		const max = buildingData[CITY_TYPE].stature

		runCaptureFor(map, 5)
		expect(map.layers.buildings[5]!.stature).toBe(max - 5)
		expect(map.layers.buildings[5]!.team).toBe(1)
	})

	it('does not reduce stature when standing on a friendly building', () => {
		const map = makeMap()
		map.layers.units[5] = unit(0)
		map.layers.buildings[5] = building(0, CITY_TYPE)
		initGameStateFromMap(map)

		runCaptureFor(map, 5)
		expect(map.layers.buildings[5]!.stature).toBeUndefined()
		expect(map.layers.buildings[5]!.team).toBe(0)
	})

	it('is safe when there is no building on the tile', () => {
		const map = makeMap()
		map.layers.units[5] = unit(0)
		initGameStateFromMap(map)

		expect(() => runCaptureFor(map, 5)).not.toThrow()
	})

	it('captures a neutral (team 4) Command Center without eliminating anyone', () => {
		const map = makeMap()
		map.layers.units[5] = unit(0)
		map.layers.buildings[5] = building(NEUTRAL_TEAM, COMMAND_CENTER_TYPE, 10)
		// A real opponent exists so the roster has players to (not) eliminate.
		map.layers.units[1] = unit(1)
		initGameStateFromMap(map)

		runCaptureFor(map, 5) // 10 − 10 = 0 → flips to the capturing team
		expect(map.layers.buildings[5]!.team).toBe(0)
		// previousTeam was neutral (4), which owns no player, so Capture.Insta_Lose
		// must not flip anyone to hasLost.
		expect(get(gameState).players.every((p) => !p.hasLost)).toBe(true)
	})

	it('Command Center capture flips team and resets stature to its max (30)', () => {
		const map = makeMap()
		map.layers.units[5] = unit(0)
		map.layers.buildings[5] = building(1, COMMAND_CENTER_TYPE, 10)
		initGameStateFromMap(map)

		runCaptureFor(map, 5)
		expect(map.layers.buildings[5]!.team).toBe(0)
		expect(map.layers.buildings[5]!.stature).toBe(buildingData[COMMAND_CENTER_TYPE].stature)
	})
})

describe('Capture.Allow_* control flag propagation', () => {
	beforeEach(() => {
		resetGameState()
		clearModifierRegistry()
	})

	it('initializes controls from starting buildings', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		map.layers.buildings[0] = building(0, GROUND_CONTROL_TYPE)
		map.layers.buildings[1] = building(1, AIR_CONTROL_TYPE)
		initGameStateFromMap(map)

		expect(controlsOf(0)).toEqual({ ground: true, air: false, sea: false })
		expect(controlsOf(1)).toEqual({ ground: false, air: true, sea: false })
	})

	it('capturing Ground Control sets the new owner ground=true; old owner loses it if it was their only one', () => {
		const map = makeMap()
		map.layers.units[2] = unit(0, STRIKE_COMMANDO_TYPE, STRIKE_MAX_HP / 2)
		map.layers.buildings[2] = building(1, GROUND_CONTROL_TYPE, 5)
		// Give team 1 a second unrelated building so player 1 still exists in roster.
		map.layers.buildings[3] = building(1, CITY_TYPE)
		initGameStateFromMap(map)

		expect(controlsOf(1)?.ground).toBe(true)
		expect(controlsOf(0)?.ground).toBe(false)

		runCaptureFor(map, 2)
		expect(map.layers.buildings[2]!.team).toBe(0)
		expect(controlsOf(0)?.ground).toBe(true)
		expect(controlsOf(1)?.ground).toBe(false)
	})

	it('old owner KEEPS ground=true if they had another Ground Control', () => {
		const map = makeMap()
		map.layers.units[2] = unit(0, STRIKE_COMMANDO_TYPE, STRIKE_MAX_HP / 2)
		map.layers.buildings[2] = building(1, GROUND_CONTROL_TYPE, 5)
		// Second Ground Control still owned by team 1.
		map.layers.buildings[7] = building(1, GROUND_CONTROL_TYPE)
		initGameStateFromMap(map)

		runCaptureFor(map, 2)
		expect(map.layers.buildings[2]!.team).toBe(0)
		expect(controlsOf(0)?.ground).toBe(true)
		expect(controlsOf(1)?.ground).toBe(true)
	})

	it('end-of-turn dispatcher fires Start_Turn.Capture for the new active team only', () => {
		const map = makeMap()
		// Team 1's commando is sitting on team 0's City.
		map.layers.units[5] = unit(1)
		map.layers.buildings[5] = building(0, CITY_TYPE)
		// Team 0 also owns a unit so it gets added to the roster and starts the match.
		map.layers.units[0] = unit(0)
		initGameStateFromMap(map)

		const max = buildingData[CITY_TYPE].stature

		// End team 0's turn → team 1's Start_Turn handlers fire (its unit on the city captures).
		endTurn({ map })

		expect(map.layers.buildings[5]!.stature).toBe(max - 10)
	})
})
