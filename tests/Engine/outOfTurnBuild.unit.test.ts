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

import { interactor, commitFactoryBuild } from '../../src/lib/Engine/Interactor/interactor'
import {
	interactionState,
	interactionSource,
} from '../../src/lib/Engine/Interactor/interactionState'
import { buildMenuState, closeBuildMenu } from '../../src/lib/Engine/HUD/buildMenuStore'
import { viewerTeam } from '../../src/lib/Engine/threatOverlay'
import { outgoingActions } from '../../src/lib/Engine/outgoingActions'
import { gameState, resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { spawnBuiltUnit } from '../../src/lib/Engine/build'
import { endTurn } from '../../src/lib/Engine/turnLoop'
import type { SerializedAction } from '../../src/lib/Engine/Interactor/serializedAction'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

const WARFACTORY_TYPE = buildingData.findIndex((b) => b.name === 'Warfactory')
const GROUND_UNIT_TYPE = unitData.findIndex((u) => u.type === 'ground' && u.movement > 0)
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')

const MY_FACTORY = 5
const THEIR_FACTORY = 10

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

/** A two-sided board: each team owns a factory and one unit, and both are rich. */
const twoTeamBoard = (): MapObject => {
	const map = makeMap()
	map.layers.buildings[MY_FACTORY] = { type: WARFACTORY_TYPE, state: 0, team: 0 }
	map.layers.buildings[THEIR_FACTORY] = { type: WARFACTORY_TYPE, state: 0, team: 1 }
	map.layers.units[0] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 10 }
	map.layers.units[15] = { type: GROUND_UNIT_TYPE, state: 0, team: 1, health: 10 }
	initGameStateFromMap(map)
	gameState.update((s) => ({
		...s,
		players: s.players.map((p) => ({
			...p,
			money: 99999,
			controls: { ground: 1, air: 1, sea: 1 },
		})),
	}))
	return map
}

describe('production is gated to the team whose turn it is, viewed by its own player', () => {
	beforeEach(() => {
		resetGameState()
		closeBuildMenu()
		interactionState.set('select')
		interactionSource.set(null)
		viewerTeam.set(0)
		outgoingActions.set(null)
	})

	it('opens the build menu on my own factory during my turn', () => {
		const map = twoTeamBoard()

		interactor({ map, tile: MY_FACTORY })

		expect(get(buildMenuState).open).toBe(true)
		expect(get(buildMenuState).buildingTile).toBe(MY_FACTORY)
		expect(get(buildMenuState).team).toBe(0)
	})

	it('never opens the build menu on an opposing factory during their turn', () => {
		const map = twoTeamBoard()
		endTurn({ map })
		expect(get(gameState).currentTeam).toBe(1)

		// The board this client is looking at still belongs to team 0.
		interactor({ map, tile: THEIR_FACTORY })

		expect(get(buildMenuState).open).toBe(false)
	})

	it('refuses to spawn a unit for a team that is not on turn', () => {
		const map = twoTeamBoard()
		endTurn({ map })

		const result = spawnBuiltUnit(map, MY_FACTORY, GROUND_UNIT_TYPE, 0)

		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('not-buildable')
		expect(map.layers.units[MY_FACTORY]).toBeNull()
		expect(get(gameState).players.find((p) => p.team === 0)?.money).toBe(99999)
	})

	it('relays a factory build so an online opponent sees the unit', () => {
		const map = twoTeamBoard()
		const emitted: SerializedAction[] = []
		const unsubscribe = outgoingActions.subscribe((action) => {
			if (action) emitted.push(action)
		})

		const built = commitFactoryBuild(map, MY_FACTORY, GROUND_UNIT_TYPE)
		unsubscribe()

		expect(built).toBe(true)
		expect(map.layers.units[MY_FACTORY]?.team).toBe(0)
		expect(emitted).toContainEqual({
			kind: 'build',
			building: MY_FACTORY,
			unitType: GROUND_UNIT_TYPE,
		})
	})

	it('commits nothing (and relays nothing) when the factory tile is blocked', () => {
		const map = twoTeamBoard()
		map.layers.units[MY_FACTORY] = { type: GROUND_UNIT_TYPE, state: 0, team: 0, health: 10 }
		const emitted: SerializedAction[] = []
		const unsubscribe = outgoingActions.subscribe((action) => {
			if (action) emitted.push(action)
		})

		const built = commitFactoryBuild(map, MY_FACTORY, GROUND_UNIT_TYPE)
		unsubscribe()

		expect(built).toBe(false)
		expect(emitted).toHaveLength(0)
	})
})
