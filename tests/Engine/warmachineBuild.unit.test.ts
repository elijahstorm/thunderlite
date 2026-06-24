// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../../src/lib/Engine/Animator/animator', () => ({
	animateRoute: () => Promise.resolve(),
	animateHealthBar: () => Promise.resolve(),
}))
vi.mock('../../src/lib/Audio/audioEngine', () => ({
	audioEngine: { playSfx: () => {} },
}))

import { computeAvailableActions } from '../../src/lib/Engine/actions'
import { buildableAdjacentTiles } from '../../src/lib/Engine/modifiers/builder'
import { beginBuildPlacement, interactor } from '../../src/lib/Engine/Interactor/interactor'
import {
	interactionState,
	interactionSource,
} from '../../src/lib/Engine/Interactor/interactionState'
import { gameState, resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'

const WARMACHINE_TYPE = unitData.findIndex((u) => u.name === 'Warmachine')
const SCORPION_TANK_TYPE = unitData.findIndex((u) => u.name === 'Scorpion Tank')
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const SEA = terrainData.findIndex((t) => t.name === 'Sea')

const warmachine = (team: number): UnitObject => ({
	type: WARMACHINE_TYPE,
	state: 0,
	team,
	health: unitData[WARMACHINE_TYPE].health,
})

const makeMap = (): MapObject =>
	({
		cols: 4,
		rows: 4,
		layers: {
			ground: new Array(16).fill(0).map(() => ({ type: PLAINS, state: 0 })),
			sky: new Array(16).fill(null),
			units: new Array(16).fill(null),
			buildings: new Array(16).fill(null),
		},
		highlights: new Array(16),
		route: [],
		pathHistory: [],
	}) as unknown as MapObject

describe('warmachine build — no move + build in the same turn', () => {
	it('offers build only when the unit has not moved this turn', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		initGameStateFromMap(map)

		const stationary = computeAvailableActions({ map, tile: 5, unit: map.layers.units[5]!, moved: false })
		expect(stationary.some((i) => i.id === 'build')).toBe(true)

		const afterMoving = computeAvailableActions({ map, tile: 5, unit: map.layers.units[5]!, moved: true })
		expect(afterMoving.some((i) => i.id === 'build')).toBe(false)
	})
})

describe('warmachine build — directional placement validates terrain', () => {
	it('excludes adjacent tiles the built unit cannot stand on', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		map.layers.ground[6].type = SEA // east of tile 5 is open water
		// Scorpion Tank is a ground unit — it can't be deployed onto the sea tile.
		const tiles = buildableAdjacentTiles(map, 5, SCORPION_TANK_TYPE)
		expect(tiles).not.toContain(6)
		expect(tiles).toEqual(expect.arrayContaining([1, 4, 9]))
	})
})

describe('warmachine build — directional picker flow', () => {
	beforeEach(() => {
		resetGameState()
		interactionState.set('select')
		interactionSource.set(null)
	})

	it('paints valid directions and deploys to the chosen tile, marking the builder acted', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		initGameStateFromMap(map)

		const started = beginBuildPlacement(map, 5, 0, SCORPION_TANK_TYPE)
		expect(started).toBe(true)
		expect(get(interactionState)).toBe('selectBuildTile')
		// All four cardinals are plains → highlighted with directional arrows.
		expect(map.highlights[1]).toBeTruthy()
		expect(map.route[6]).toMatchObject({ state: 3, rotate: 0 }) // east
		expect(map.route[9]).toMatchObject({ state: 3, rotate: 1 }) // south

		// Pick the southern tile.
		interactor({ map, tile: 9 })
		expect(map.layers.units[9]?.type).toBe(SCORPION_TANK_TYPE)
		expect(get(gameState).actedTiles.has(9)).toBe(true)
		expect(get(gameState).actedTiles.has(5)).toBe(true)
		expect(get(interactionState)).toBe('select')
	})

	it('cancels without building when a non-highlighted tile is clicked', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		initGameStateFromMap(map)

		beginBuildPlacement(map, 5, 0, SCORPION_TANK_TYPE)
		// Tile 0 is not adjacent to the builder at 5 — clicking it cancels.
		interactor({ map, tile: 0 })
		expect(map.layers.units[0]).toBeNull()
		expect(get(gameState).actedTiles.has(5)).toBe(false)
		expect(get(interactionState)).toBe('select')
	})

	it('refuses to start when no adjacent tile can hold the unit', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		for (const t of [1, 4, 6, 9]) map.layers.ground[t].type = SEA
		initGameStateFromMap(map)

		expect(beginBuildPlacement(map, 5, 0, SCORPION_TANK_TYPE)).toBe(false)
		expect(get(interactionState)).toBe('select')
	})
})
