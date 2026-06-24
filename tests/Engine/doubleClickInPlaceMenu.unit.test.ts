// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../../src/lib/Engine/Animator/animator', () => ({
	animateRoute: () => Promise.resolve(),
	animateHealthBar: () => Promise.resolve(),
}))
vi.mock('../../src/lib/Audio/audioEngine', () => ({ audioEngine: { playSfx: () => {} } }))

import {
	interactor,
	openInPlaceMenu,
	reopenMenuFromPeek,
	cancelMenu,
} from '../../src/lib/Engine/Interactor/interactor'
import {
	interactionState,
	interactionSource,
} from '../../src/lib/Engine/Interactor/interactionState'
import { actionMenuState, closeActionMenu } from '../../src/lib/Engine/HUD/actionMenuStore'
import {
	resetGameState,
	initGameStateFromMap,
	hasTileActed,
} from '../../src/lib/Engine/gameState'
import { setSelectedTile } from '../../src/lib/Engine/uiState'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'

const WARFACTORY_TYPE = buildingData.findIndex((b) => b.name === 'Warfactory')
const GROUND_UNIT_TYPE = unitData.findIndex((u) => u.type === 'ground' && u.movement > 0)
const FULL_HP = unitData[GROUND_UNIT_TYPE].health

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

// Faithful re-implementation of GameStateManager.select's click wrapper, so we can
// exercise the double-click path the real board takes (the .svelte file can't be
// imported in a node test).
const makeBoardClick = (map: MapObject) => {
	let lastClickTile = -1
	let lastClickAt = 0
	const DOUBLE_CLICK_MS = 350
	return (tile: number, now: number) => {
		if (get(actionMenuState).peeking && reopenMenuFromPeek(map)) return
		const isDoubleClick =
			tile >= 0 && tile === lastClickTile && now - lastClickAt < DOUBLE_CLICK_MS
		lastClickTile = tile
		lastClickAt = now
		if (isDoubleClick) {
			lastClickTile = -1
			openInPlaceMenu(map, tile)
			return
		}
		setSelectedTile(tile)
		interactor({ map, tile })
	}
}

describe('openInPlaceMenu only opens when there is a real stationary action', () => {
	beforeEach(() => {
		resetGameState()
		interactionState.set('select')
		interactionSource.set(null)
		closeActionMenu()
	})

	it('does NOT open a wait-only menu for a full-health unit on its own warfactory', () => {
		const map = makeMap()
		const F = 5
		map.layers.units[F] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: FULL_HP }
		map.layers.buildings[F] = { type: WARFACTORY_TYPE, state: 0, team: 0 }
		initGameStateFromMap(map)

		expect(openInPlaceMenu(map, F)).toBe(false)
		expect(get(actionMenuState).open).toBe(false)
	})

	it('DOES open for a damaged unit (repair is a real in-place action)', () => {
		const map = makeMap()
		const F = 5
		map.layers.units[F] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 1 }
		map.layers.buildings[F] = { type: WARFACTORY_TYPE, state: 0, team: 0 }
		initGameStateFromMap(map)

		expect(openInPlaceMenu(map, F)).toBe(true)
		expect(get(actionMenuState).open).toBe(true)
		closeActionMenu()
	})

	it('flags the in-place menu as not-yet-moved so it offers a real cancel', () => {
		const map = makeMap()
		const F = 5
		map.layers.units[F] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 1 }
		map.layers.buildings[F] = { type: WARFACTORY_TYPE, state: 0, team: 0 }
		initGameStateFromMap(map)

		openInPlaceMenu(map, F)
		expect(get(actionMenuState).moved).toBe(false)
		closeActionMenu()
	})

	it('cancelling an in-place menu deselects without idling the unit', () => {
		const map = makeMap()
		const F = 5
		map.layers.units[F] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 1 }
		map.layers.buildings[F] = { type: WARFACTORY_TYPE, state: 0, team: 0 }
		initGameStateFromMap(map)

		openInPlaceMenu(map, F)
		cancelMenu()

		// Menu fully closed (not merely peeking) and the unit never used its turn,
		// so it can still be selected/moved.
		const menu = get(actionMenuState)
		expect(menu.open).toBe(false)
		expect(menu.peeking).toBe(false)
		expect(hasTileActed(F)).toBe(false)
	})
})

describe('double-tapping a unit on a warfactory still lets it move off', () => {
	beforeEach(() => {
		resetGameState()
		interactionState.set('select')
		interactionSource.set(null)
		closeActionMenu()
	})

	it('accidental double-click keeps the unit selected, then a move commits', async () => {
		const map = makeMap()
		const F = 5
		const D = 6
		map.layers.units[F] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: FULL_HP }
		map.layers.buildings[F] = { type: WARFACTORY_TYPE, state: 0, team: 0 }
		initGameStateFromMap(map)
		const click = makeBoardClick(map)

		click(F, 1000)
		click(F, 1080) // fast second tap on the same tile

		// No trapping wait-only menu, and the unit is still selected from the first tap.
		expect(get(actionMenuState).open).toBe(false)
		expect(get(interactionState)).toBe('choice')
		expect(get(interactionSource)).toBe(F)

		click(D, 1600) // now move it off the factory
		await Promise.resolve()
		await Promise.resolve()

		expect(map.layers.units[F]).toBeNull()
		expect(map.layers.units[D]).not.toBeNull()
	})

	it('a stray second tap on an empty destination factory does not pop the build menu mid-move', async () => {
		const map = makeMap()
		const A = 5
		const W = 6
		map.layers.units[A] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: FULL_HP }
		map.layers.buildings[W] = { type: WARFACTORY_TYPE, state: 0, team: 0 }
		initGameStateFromMap(map)
		const click = makeBoardClick(map)

		click(A, 1000)
		click(W, 2000) // move A -> W
		await Promise.resolve()
		await Promise.resolve()
		expect(map.layers.units[W]).not.toBeNull()

		// The double-tap's second click is swallowed instead of re-selecting the now
		// empty-looking factory tile and opening the build menu.
		click(W, 2050)
		expect(map.layers.units[W]).not.toBeNull()
	})
})
