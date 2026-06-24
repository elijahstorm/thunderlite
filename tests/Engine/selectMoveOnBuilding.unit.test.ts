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

import {
	interactor,
	resetInteraction,
	openInPlaceMenu,
} from '../../src/lib/Engine/Interactor/interactor'
import {
	interactionState,
	interactionSource,
} from '../../src/lib/Engine/Interactor/interactionState'
import { actionMenuState, closeActionMenu } from '../../src/lib/Engine/HUD/actionMenuStore'
import {
	gameState,
	resetGameState,
	initGameStateFromMap,
} from '../../src/lib/Engine/gameState'
import { spawnBuiltUnit } from '../../src/lib/Engine/build'
import { endTurn } from '../../src/lib/Engine/turnLoop'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'

const WARFACTORY_TYPE = buildingData.findIndex((b) => b.name === 'Warfactory')
const GROUND_UNIT_TYPE = unitData.findIndex((u) => u.type === 'ground' && u.movement > 0)

const makeMap = (): MapObject =>
	({
		cols: 4,
		rows: 4,
		layers: {
			ground: new Array(16).fill(0).map(() => ({ type: 0, state: 0 })),
			sky: new Array(16).fill(null),
			units: new Array(16).fill(null),
			buildings: new Array(16).fill(null),
		},
		highlights: new Array(16),
		route: [],
		pathHistory: [],
	}) as unknown as MapObject

describe('selecting and moving a unit standing on an actable building', () => {
	beforeEach(() => {
		resetGameState()
		interactionState.set('select')
		interactionSource.set(null)
	})

	it('selects the unit (not the build menu) and moves it to an empty tile', async () => {
		const map = makeMap()
		const unitTile = 5
		const destTile = 6 // adjacent empty tile
		map.layers.buildings[unitTile] = { type: WARFACTORY_TYPE, state: 0, team: 0 }
		map.layers.units[unitTile] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 10 }
		initGameStateFromMap(map)

		// First click: select the unit.
		interactor({ map, tile: unitTile })
		expect(get(interactionState)).toBe('choice')
		expect(get(interactionSource)).toBe(unitTile)

		// Second click: choose the destination.
		interactor({ map, tile: destTile })
		await Promise.resolve()
		await Promise.resolve()

		expect(map.layers.units[unitTile]).toBeNull()
		expect(map.layers.units[destTile]).not.toBeNull()
		expect(get(gameState).actedTiles.has(destTile)).toBe(true)
	})

	it('full flow: build on warfactory, cycle turn, then move it next turn', async () => {
		const map = makeMap()
		const factoryTile = 5
		const destTile = 6
		map.layers.buildings[factoryTile] = { type: WARFACTORY_TYPE, state: 0, team: 0 }
		// A unit elsewhere so team 0 isn't eliminated and remains the only player.
		map.layers.units[0] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 10 }
		initGameStateFromMap(map)
		// Give the player enough money + ground control to build.
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) => ({
				...p,
				money: 99999,
				controls: { ground: true, air: true, sea: true },
			})),
		}))

		// Build a unit on the warfactory.
		const result = spawnBuiltUnit(map, factoryTile, GROUND_UNIT_TYPE, 0)
		expect(result.ok).toBe(true)
		expect(map.layers.units[factoryTile]).not.toBeNull()
		// Same turn: the freshly built unit is marked acted.
		expect(get(gameState).actedTiles.has(factoryTile)).toBe(true)

		// Cycle the turn (single player → wraps back to team 0, clears actedTiles).
		endTurn({ map })
		expect(get(gameState).currentTeam).toBe(0)
		expect(get(gameState).actedTiles.has(factoryTile)).toBe(false)

		// Next turn: select the built unit and move it.
		interactionState.set('select')
		interactionSource.set(null)
		interactor({ map, tile: factoryTile })
		expect(get(interactionState)).toBe('choice')
		expect(get(interactionSource)).toBe(factoryTile)

		interactor({ map, tile: destTile })
		await Promise.resolve()
		await Promise.resolve()

		expect(map.layers.units[factoryTile]).toBeNull()
		expect(map.layers.units[destTile]).not.toBeNull()
	})

	it('a stale choice-state from a prior turn blocks the next selection until reset', () => {
		const map = makeMap()
		const unitTile = 5
		map.layers.units[unitTile] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 10 }
		map.layers.units[8] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 10 }
		initGameStateFromMap(map)

		// Simulate ending a turn while a unit was selected (left in 'choice' with a
		// stale source) — the bug behind #2.
		interactor({ map, tile: unitTile })
		expect(get(interactionState)).toBe('choice')

		// Without a reset, the first click next turn is misrouted as a `choice`
		// against the stale source rather than selecting the clicked unit.
		interactor({ map, tile: 8 })
		expect(get(interactionSource)).toBeNull() // choice consumed the click, no new selection

		// resetInteraction (now run on every turn handoff) clears the stale state so
		// the very next click selects normally.
		resetInteraction(map)
		expect(get(interactionState)).toBe('select')
		interactor({ map, tile: 8 })
		expect(get(interactionState)).toBe('choice')
		expect(get(interactionSource)).toBe(8)
	})

	it('openInPlaceMenu opens the action menu without moving the unit', () => {
		const map = makeMap()
		const unitTile = 5
		// A capturable building next to the unit gives the in-place menu a real action.
		map.layers.units[unitTile] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 10 }
		initGameStateFromMap(map)
		closeActionMenu()

		const opened = openInPlaceMenu(map, unitTile)
		expect(opened).toBe(true)
		const menu = get(actionMenuState)
		expect(menu.open).toBe(true)
		expect(menu.unitTile).toBe(unitTile)
		// The unit has not moved and is still selectable (not yet acted).
		expect(map.layers.units[unitTile]).not.toBeNull()
		closeActionMenu()
	})
})
