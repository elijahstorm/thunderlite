// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import {
	gameState,
	resetGameState,
	initGameStateFromMap,
	markTileActed,
	type Player,
} from '../../src/lib/Engine/gameState'
import { endTurn, nextActiveTeam } from '../../src/lib/Engine/turnLoop'
import {
	clearModifierRegistry,
	registerModifier,
} from '../../src/lib/Engine/modifiers'

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
// Stealth Tank declares End_Turn.Cloak — see GameData/unit.ts.
const STEALTH_TANK_TYPE = 6

const player = (team: number, hasLost = false): Player => ({ team, money: 0, hasLost })

describe('nextActiveTeam', () => {
	it('returns null when there are no players', () => {
		expect(nextActiveTeam([], 0)).toBeNull()
	})

	it('returns null when every player has lost', () => {
		expect(nextActiveTeam([player(0, true), player(1, true)], 0)).toBeNull()
	})

	it('advances to the next team without wrapping', () => {
		expect(nextActiveTeam([player(0), player(1)], 0)).toEqual({ team: 1, wrapped: false })
	})

	it('wraps from the last team back to the first and flags wrapped=true', () => {
		expect(nextActiveTeam([player(0), player(1)], 1)).toEqual({ team: 0, wrapped: true })
	})

	it('skips players whose hasLost is true', () => {
		const players = [player(0), player(1, true), player(2)]
		expect(nextActiveTeam(players, 0)).toEqual({ team: 2, wrapped: false })
	})

	it('wraps over a lost player and flags wrapped=true', () => {
		const players = [player(0), player(1), player(2, true)]
		expect(nextActiveTeam(players, 1)).toEqual({ team: 0, wrapped: true })
	})

	it('returns the same team (wrapped) when only one eligible player remains', () => {
		const players = [player(0), player(1, true)]
		expect(nextActiveTeam(players, 0)).toEqual({ team: 0, wrapped: true })
	})
})

describe('endTurn', () => {
	beforeEach(() => {
		resetGameState()
		clearModifierRegistry()
	})

	it('advances currentTeam to the next non-lost player and keeps turnNumber when not wrapping', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		initGameStateFromMap(map)

		endTurn({ map })

		const state = get(gameState)
		expect(state.currentTeam).toBe(1)
		expect(state.turnNumber).toBe(1)
	})

	it('increments turnNumber when the team pointer wraps back to player 0', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		initGameStateFromMap(map)

		endTurn({ map })
		endTurn({ map })

		const state = get(gameState)
		expect(state.currentTeam).toBe(0)
		expect(state.turnNumber).toBe(2)
	})

	it('clears actedTiles on end-turn so the new player can act again', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		initGameStateFromMap(map)
		markTileActed(0)
		expect(get(gameState).actedTiles.size).toBe(1)

		endTurn({ map })

		expect(get(gameState).actedTiles.size).toBe(0)
	})

	it('skips players whose hasLost is true', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		map.layers.units[2] = unit(2)
		initGameStateFromMap(map)

		gameState.update((s) => ({
			...s,
			players: s.players.map((p) => (p.team === 1 ? { ...p, hasLost: true } : p)),
		}))

		endTurn({ map })

		expect(get(gameState).currentTeam).toBe(2)
	})

	it('no-ops when phase is not playing', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, phase: 'gameOver', winner: 0 }))

		endTurn({ map })

		const state = get(gameState)
		expect(state.currentTeam).toBe(0)
		expect(state.turnNumber).toBe(1)
		expect(state.phase).toBe('gameOver')
	})

	it('runs End_Turn handlers against the outgoing team only', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0, STEALTH_TANK_TYPE)
		map.layers.units[1] = unit(1, STEALTH_TANK_TYPE)
		initGameStateFromMap(map)

		const teamsSeen: number[] = []
		registerModifier('End_Turn.Cloak', (target) => {
			teamsSeen.push((target as UnitObject).team)
		})

		endTurn({ map })

		expect(teamsSeen).toEqual([0])
	})

	it('runs Start_Turn handlers against units and buildings of the incoming team', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0, STRIKE_COMMANDO_TYPE)
		// Wounded friendly unit on a Command Center belonging to the incoming team.
		map.layers.units[5] = unit(1, STRIKE_COMMANDO_TYPE, 20)
		map.layers.buildings[5] = building(1, COMMAND_CENTER_TYPE)
		initGameStateFromMap(map)

		endTurn({ map })

		// healTeam (built-in Start_Turn.Heal_Team handler on the Command Center) heals +10
		expect(map.layers.units[5]!.health).toBe(30)
	})

	it('is safe when called with no map (no modifier dispatch, but state still advances)', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[1] = unit(1)
		initGameStateFromMap(map)

		expect(() => endTurn()).not.toThrow()
		expect(get(gameState).currentTeam).toBe(1)
	})

	it('does nothing meaningful when no players are eligible', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) => ({ ...p, hasLost: true })),
		}))

		expect(() => endTurn({ map })).not.toThrow()
		const state = get(gameState)
		// currentTeam stays the same since no eligible target.
		expect(state.currentTeam).toBe(0)
		expect(state.turnNumber).toBe(1)
	})
})
