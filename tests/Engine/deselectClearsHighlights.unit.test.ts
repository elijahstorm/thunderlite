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

import { interactor } from '../../src/lib/Engine/Interactor/interactor'
import {
	interactionState,
	interactionSource,
} from '../../src/lib/Engine/Interactor/interactionState'
import { highlightActionsList } from '../../src/lib/Layers/tileHighlighter'
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

const paintedHighlightCount = (map: MapObject): number =>
	map.highlights.filter((h) => h != null).length

describe('a dead click always clears stale selection highlights (no softlock)', () => {
	beforeEach(() => {
		resetGameState()
		interactionState.set('select')
		interactionSource.set(null)
	})

	it('clicking empty ground after selecting clears the move highlights and deselects', () => {
		const map = makeMap()
		const unitTile = 5
		map.layers.units[unitTile] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 10 }
		initGameStateFromMap(map)

		interactor({ map, tile: unitTile })
		expect(get(interactionState)).toBe('choice')
		expect(paintedHighlightCount(map)).toBeGreaterThan(0)

		// Click a far-away empty tile that is not a valid move/attack target.
		const emptyFarTile = 15
		interactor({ map, tile: emptyFarTile })

		expect(get(interactionState)).toBe('select')
		expect(get(interactionSource)).toBeNull()
		// choice cleared the highlights when the click didn't resolve to an action.
		expect(paintedHighlightCount(map)).toBe(0)

		// And a follow-up click on more empty ground keeps the board clear (the
		// `select` dead-click path is the safety net).
		highlightActionsList(map, [{ tile: 3, type: 0, tip: 0 }]) // simulate a stray leftover
		expect(paintedHighlightCount(map)).toBe(1)
		interactor({ map, tile: 12 })
		expect(paintedHighlightCount(map)).toBe(0)
	})

	it('a stale choice whose unit has vanished still clears the orphaned highlights', () => {
		const map = makeMap()
		const ghostTile = 5
		// Simulate a selection carried over from a prior state: choice with a source
		// tile that no longer holds a unit, and leftover highlights painted.
		interactionState.set('choice')
		interactionSource.set(ghostTile)
		highlightActionsList(map, [
			{ tile: 6, type: 0, tip: 0 },
			{ tile: 9, type: 0, tip: 0 },
		])
		map.route = new Array(16)
		map.route[6] = { state: 3, rotate: 0, index: 0 }
		expect(paintedHighlightCount(map)).toBe(2)

		interactor({ map, tile: 10 })

		expect(get(interactionState)).toBe('select')
		expect(get(interactionSource)).toBeNull()
		expect(paintedHighlightCount(map)).toBe(0)
		expect(map.route.filter((r) => r != null).length).toBe(0)
	})

	it('clicking your own unselectable warfactory (no unit on it) clears stale highlights', () => {
		const map = makeMap()
		const factoryTile = 6
		// Team 0 is the current player (their unit makes them players[0]); the
		// warfactory belongs to enemy team 1, so it isn't buildable and clicking it is
		// a dead click that should still clear any lingering overlay.
		map.layers.units[0] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 10 }
		map.layers.buildings[factoryTile] = { type: WARFACTORY_TYPE, state: 0, team: 1 }
		initGameStateFromMap(map)

		highlightActionsList(map, [{ tile: 2, type: 0, tip: 0 }])
		expect(paintedHighlightCount(map)).toBe(1)

		interactor({ map, tile: factoryTile })
		expect(get(interactionState)).toBe('select')
		expect(paintedHighlightCount(map)).toBe(0)
	})

	it('clicking off the attack targets cancels instead of softlocking', () => {
		const map = makeMap()
		const attackerTile = 5
		map.layers.units[attackerTile] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 10 }
		initGameStateFromMap(map)

		// Drive straight into the attack-target prompt with some red highlights up.
		interactionSource.set(attackerTile)
		interactionState.set('selectAttackTarget')
		highlightActionsList(map, [{ tile: 1, type: 1, tip: 1 }])
		expect(paintedHighlightCount(map)).toBe(1)

		// Click a tile that holds no enemy — should cancel, not get swallowed.
		interactor({ map, tile: 12 })

		expect(get(interactionState)).toBe('select')
		expect(get(interactionSource)).toBeNull()
		expect(paintedHighlightCount(map)).toBe(0)
	})
})
