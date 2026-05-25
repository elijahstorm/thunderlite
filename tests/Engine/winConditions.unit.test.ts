// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import {
	gameState,
	resetGameState,
	initGameStateFromMap,
} from '../../src/lib/Engine/gameState'
import {
	evaluateWinConditions,
	applyWinConditions,
} from '../../src/lib/Engine/winConditions'
import { endTurn } from '../../src/lib/Engine/turnLoop'
import { clearModifierRegistry } from '../../src/lib/Engine/modifiers'
import { buildingData } from '../../src/lib/GameData/building'
import { unitData } from '../../src/lib/GameData/unit'

const COMMAND_CENTER_TYPE = buildingData.findIndex((b) => b.name === 'Command Center')
const CITY_TYPE = buildingData.findIndex((b) => b.name === 'City')
const STRIKE_COMMANDO_TYPE = unitData.findIndex((u) => u.name === 'Strike Commando')

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

const unit = (team: number, type = STRIKE_COMMANDO_TYPE): UnitObject => ({
	type,
	state: 0,
	team,
})

const building = (team: number, type: number, stature?: number): BuildingObject => ({
	type,
	state: 0,
	team,
	...(typeof stature === 'number' ? { stature } : {}),
})

describe('evaluateWinConditions (pure)', () => {
	beforeEach(() => {
		resetGameState()
		clearModifierRegistry()
	})

	it('returns gameOver=false when multiple teams have units and command centers', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		map.layers.units[2] = unit(2)
		map.layers.buildings[0] = building(0, COMMAND_CENTER_TYPE)
		map.layers.buildings[1] = building(1, COMMAND_CENTER_TYPE)
		map.layers.buildings[2] = building(2, COMMAND_CENTER_TYPE)
		initGameStateFromMap(map)

		const result = evaluateWinConditions(get(gameState), map)
		expect(result.gameOver).toBe(false)
		expect(result.losers).toEqual([])
	})

	it('3-player setup: a team with no units AND no Command Center is flagged as a loser', () => {
		const map = makeMap()
		// Seed three players via units so all are in the roster.
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		map.layers.units[2] = unit(2)
		initGameStateFromMap(map)

		// Now wipe team 1 entirely: no units, no Command Centers.
		map.layers.units[1] = null

		const result = evaluateWinConditions(get(gameState), map)
		expect(result.losers).toContain(1)
		expect(result.gameOver).toBe(false) // two teams still alive
	})

	it('3-player setup: team 1 loses BOTH Command Centers and has no units → marked lost, no winner yet', () => {
		const map = makeMap()
		// Team 1 starts with 2 Command Centers + 1 unit. Other teams alive.
		map.layers.units[0] = unit(0)
		map.layers.buildings[0] = building(0, COMMAND_CENTER_TYPE)
		map.layers.units[2] = unit(2)
		map.layers.buildings[2] = building(2, COMMAND_CENTER_TYPE)
		map.layers.units[5] = unit(1)
		map.layers.buildings[6] = building(1, COMMAND_CENTER_TYPE)
		map.layers.buildings[7] = building(1, COMMAND_CENTER_TYPE)
		initGameStateFromMap(map)

		// Wipe everything team 1 owns.
		map.layers.units[5] = null
		map.layers.buildings[6] = null
		map.layers.buildings[7] = null

		const result = evaluateWinConditions(get(gameState), map)
		expect(result.losers).toEqual([1])
		expect(result.gameOver).toBe(false)
	})

	it('declares the last team standing the winner', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		initGameStateFromMap(map)
		// Mark team 0 lost so only team 1 survives.
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0 ? { ...p, hasLost: true } : p
			),
		}))

		const result = evaluateWinConditions(get(gameState), map)
		expect(result.gameOver).toBe(true)
		expect(result.winner).toBe(1)
		expect(result.losers).toEqual([0])
	})

	it('is idempotent: calling twice on the same state yields identical results', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		map.layers.units[2] = unit(2)
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0 ? { ...p, hasLost: true } : p
			),
		}))

		const a = evaluateWinConditions(get(gameState), map)
		const b = evaluateWinConditions(get(gameState), map)
		expect(a).toEqual(b)
	})

	it('without a map, falls back to hasLost flags only (no auto-elimination)', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		initGameStateFromMap(map)

		const result = evaluateWinConditions(get(gameState))
		expect(result.gameOver).toBe(false)
		expect(result.losers).toEqual([])
	})

	it('does not mutate state.players', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		initGameStateFromMap(map)

		const before = get(gameState)
		const playersSnapshot = before.players.map((p) => ({ ...p }))
		evaluateWinConditions(before, map)
		const after = get(gameState)

		expect(after.players).toEqual(playersSnapshot)
	})
})

describe('applyWinConditions (side-effects)', () => {
	beforeEach(() => {
		resetGameState()
		clearModifierRegistry()
	})

	it('sets phase=gameOver and winner when only one team survives', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0 ? { ...p, hasLost: true } : p
			),
		}))

		const result = applyWinConditions(map)
		const state = get(gameState)
		expect(result.gameOver).toBe(true)
		expect(state.phase).toBe('gameOver')
		expect(state.winner).toBe(1)
	})

	it('flips hasLost=true for teams with no units AND no command center', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		map.layers.units[2] = unit(2)
		initGameStateFromMap(map)
		map.layers.units[1] = null // wipe team 1

		applyWinConditions(map)
		const state = get(gameState)
		expect(state.players.find((p) => p.team === 1)?.hasLost).toBe(true)
		expect(state.players.find((p) => p.team === 0)?.hasLost).toBe(false)
		expect(state.players.find((p) => p.team === 2)?.hasLost).toBe(false)
	})

	it('leaves phase=playing while multiple teams survive', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		map.layers.units[2] = unit(2)
		initGameStateFromMap(map)

		applyWinConditions(map)
		expect(get(gameState).phase).toBe('playing')
	})

	it('does not flip phase again if already gameOver', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			phase: 'gameOver',
			winner: 1,
			players: s.players.map((p) =>
				p.team === 0 ? { ...p, hasLost: true } : p
			),
		}))

		applyWinConditions(map)
		const state = get(gameState)
		expect(state.phase).toBe('gameOver')
		expect(state.winner).toBe(1)
	})
})

describe('capture-insta-lose integration through endTurn', () => {
	beforeEach(() => {
		resetGameState()
		clearModifierRegistry()
	})

	it('capturing the only enemy Command Center ends the game with the capturing team as winner', () => {
		const map = makeMap()
		// Team 0 unit sitting on team 1's last Command Center, one tick from capture.
		map.layers.units[5] = unit(0)
		map.layers.buildings[5] = building(1, COMMAND_CENTER_TYPE, 10)
		// Give team 1 a unit elsewhere so they're in the roster.
		map.layers.units[10] = unit(1)
		initGameStateFromMap(map)

		// Make team 1 the active team so endTurn rolls to team 0's Start_Turn (which fires capture).
		gameState.update((s) => ({ ...s, currentTeam: 1 }))

		endTurn({ map })

		const state = get(gameState)
		expect(state.phase).toBe('gameOver')
		expect(state.winner).toBe(0)
		expect(state.players.find((p) => p.team === 1)?.hasLost).toBe(true)
	})

	it('after gameOver, endTurn no-ops (phase stays gameOver)', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			phase: 'gameOver',
			winner: 0,
		}))

		endTurn({ map })
		const state = get(gameState)
		expect(state.phase).toBe('gameOver')
		expect(state.winner).toBe(0)
		// currentTeam never advanced
		expect(state.currentTeam).toBe(0)
	})

	it('does NOT end the game when a non-Command-Center capture flips ownership', () => {
		const map = makeMap()
		// Team 0 unit captures team 1's City (not a Command Center).
		map.layers.units[5] = unit(0)
		map.layers.buildings[5] = building(1, CITY_TYPE, 10)
		// Make sure team 1 still has presence so they're not auto-lost.
		map.layers.units[10] = unit(1)
		map.layers.buildings[11] = building(1, COMMAND_CENTER_TYPE)
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, currentTeam: 1 }))

		endTurn({ map })

		const state = get(gameState)
		expect(state.phase).toBe('playing')
		expect(state.players.find((p) => p.team === 1)?.hasLost).toBe(false)
	})
})
