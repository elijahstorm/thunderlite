// @vitest-environment node
// Regression: tile index 0 is falsy in JS. Selection/move guards that used
// truthiness (`source && …`, `!choice`) silently refused to command a unit
// standing on tile 0, or to move a unit onto tile 0 — which read as "can't move
// on/off this building" whenever a factory happened to sit in the top-left corner.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../../src/lib/Engine/Animator/animator', () => ({
	animateRoute: () => Promise.resolve(),
	animateHealthBar: () => Promise.resolve(),
}))
vi.mock('../../src/lib/Audio/audioEngine', () => ({ audioEngine: { playSfx: () => {} } }))

import { interactor } from '../../src/lib/Engine/Interactor/interactor'
import {
	interactionState,
	interactionSource,
} from '../../src/lib/Engine/Interactor/interactionState'
import { resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
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

describe('tile 0 (falsy index) is fully commandable', () => {
	beforeEach(() => {
		resetGameState()
		interactionState.set('select')
		interactionSource.set(null)
	})

	it('moves a unit ONTO tile 0 (a corner factory)', async () => {
		const map = makeMap()
		const start = 1 // adjacent to tile 0
		map.layers.units[start] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 10 }
		map.layers.buildings[0] = { type: WARFACTORY_TYPE, state: 0, team: 0 }
		initGameStateFromMap(map)

		interactor({ map, tile: start })
		expect(get(interactionState)).toBe('choice')

		interactor({ map, tile: 0 })
		await Promise.resolve()
		await Promise.resolve()

		expect(map.layers.units[start]).toBeNull()
		expect(map.layers.units[0]).not.toBeNull()
	})

	it('selects and moves a unit standing ON tile 0 off the factory', async () => {
		const map = makeMap()
		map.layers.units[0] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 10 }
		map.layers.buildings[0] = { type: WARFACTORY_TYPE, state: 0, team: 0 }
		initGameStateFromMap(map)

		interactor({ map, tile: 0 })
		expect(get(interactionState)).toBe('choice')
		expect(get(interactionSource)).toBe(0)

		interactor({ map, tile: 2 }) // move two tiles to the right, off the factory
		await Promise.resolve()
		await Promise.resolve()

		expect(map.layers.units[0]).toBeNull()
		expect(map.layers.units[2]).not.toBeNull()
	})
})
