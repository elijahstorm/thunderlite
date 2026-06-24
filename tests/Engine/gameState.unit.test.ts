// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import {
	gameState,
	resetGameState,
	derivePlayersFromMap,
	initGameStateFromMap,
	markTileActed,
	hasTileActed,
	clearActedTiles,
	canSelectUnit,
	NEUTRAL_TEAM,
} from '../../src/lib/Engine/gameState'

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

const building = (team: number, type = 0): BuildingObject => ({ type, state: 0, team })

describe('derivePlayersFromMap', () => {
	it('returns an empty list when the map has no team-bearing entities', () => {
		expect(derivePlayersFromMap(makeMap())).toEqual([])
	})

	it('collects distinct teams from units', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[5] = unit(1)
		map.layers.units[7] = unit(0)

		const players = derivePlayersFromMap(map)

		expect(players).toHaveLength(2)
		expect(players.map((p) => p.team)).toEqual([0, 1])
		players.forEach((p) => {
			expect(p.money).toBe(0)
			expect(p.hasLost).toBe(false)
		})
	})

	it('collects distinct teams from buildings as well as units', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.buildings[3] = building(2)
		map.layers.buildings[8] = building(1)

		const players = derivePlayersFromMap(map)

		expect(players.map((p) => p.team)).toEqual([0, 1, 2])
	})

	it('does not double up when a team appears in both layers', () => {
		const map = makeMap()
		map.layers.units[0] = unit(1)
		map.layers.buildings[1] = building(1)

		expect(derivePlayersFromMap(map)).toHaveLength(1)
	})

	it('orders the resulting roster by team id ascending', () => {
		const map = makeMap()
		map.layers.units[0] = unit(3)
		map.layers.units[1] = unit(1)
		map.layers.buildings[2] = building(2)

		expect(derivePlayersFromMap(map).map((p) => p.team)).toEqual([1, 2, 3])
	})

	it('ignores neutral (team 4) buildings — they derive no player', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.buildings[1] = building(NEUTRAL_TEAM)
		map.layers.buildings[2] = building(1)

		expect(derivePlayersFromMap(map).map((p) => p.team)).toEqual([0, 1])
	})
})

describe('initGameStateFromMap', () => {
	beforeEach(() => resetGameState())

	it('seeds the store with players, turn 1 and the first team active', () => {
		const map = makeMap()
		map.layers.units[0] = unit(1)
		map.layers.units[5] = unit(0)

		initGameStateFromMap(map)

		const state = get(gameState)
		expect(state.players.map((p) => p.team)).toEqual([0, 1])
		expect(state.currentTeam).toBe(0)
		expect(state.turnNumber).toBe(1)
		expect(state.phase).toBe('playing')
		expect(state.actedTiles.size).toBe(0)
		expect(state.winner).toBeUndefined()
	})

	it('falls back to team 0 when the map has no participants', () => {
		initGameStateFromMap(makeMap())

		const state = get(gameState)
		expect(state.players).toEqual([])
		expect(state.currentTeam).toBe(0)
	})
})

describe('actedTiles flow', () => {
	beforeEach(() => {
		resetGameState()
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[3] = unit(1)
		initGameStateFromMap(map)
	})

	it('starts empty and accumulates as tiles act', () => {
		expect(hasTileActed(0)).toBe(false)

		markTileActed(0)
		markTileActed(3)

		expect(hasTileActed(0)).toBe(true)
		expect(hasTileActed(3)).toBe(true)
		expect(hasTileActed(5)).toBe(false)
		expect(get(gameState).actedTiles.size).toBe(2)
	})

	it('clearActedTiles wipes the set without disturbing the rest of the state', () => {
		markTileActed(0)
		markTileActed(3)
		const before = get(gameState)

		clearActedTiles()

		const after = get(gameState)
		expect(after.actedTiles.size).toBe(0)
		expect(after.currentTeam).toBe(before.currentTeam)
		expect(after.turnNumber).toBe(before.turnNumber)
		expect(after.players).toBe(before.players)
	})

	it('replaces the set rather than mutating, so subscribers see a fresh reference', () => {
		const before = get(gameState).actedTiles
		markTileActed(7)
		const after = get(gameState).actedTiles
		expect(after).not.toBe(before)
		expect(after.has(7)).toBe(true)
		expect(before.has(7)).toBe(false)
	})
})

describe('canSelectUnit', () => {
	beforeEach(() => {
		resetGameState()
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[3] = unit(1)
		initGameStateFromMap(map)
	})

	it('allows selecting an owned unit that has not acted', () => {
		expect(canSelectUnit(unit(0), 0)).toBe(true)
	})

	it('blocks selecting a unit whose team is not currentTeam', () => {
		expect(canSelectUnit(unit(1), 3)).toBe(false)
	})

	it('blocks selecting a unit whose tile has already acted', () => {
		markTileActed(0)
		expect(canSelectUnit(unit(0), 0)).toBe(false)
	})

	it('blocks selection once the game has ended', () => {
		gameState.update((s) => ({ ...s, phase: 'gameOver', winner: 0 }))
		expect(canSelectUnit(unit(0), 0)).toBe(false)
	})

	it('respects an explicitly passed-in state snapshot', () => {
		const snapshot = {
			players: [{ team: 0, money: 0, hasLost: false }],
			currentTeam: 0,
			turnNumber: 1,
			actedTiles: new Set<number>([0]),
			phase: 'playing' as const,
		}
		expect(canSelectUnit(unit(0), 0, snapshot)).toBe(false)
		expect(canSelectUnit(unit(0), 1, snapshot)).toBe(true)
	})
})
