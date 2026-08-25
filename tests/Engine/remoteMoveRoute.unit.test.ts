// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { routeAnimation } from '../../src/lib/Engine/Animator/animator'
import { animateRemoteAction } from '../../src/lib/Engine/remoteAnimate'
import { pathFinder } from '../../src/lib/Engine/Interactor/Pathing/pathFinder'
import { resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'

const SCORPION_TANK = unitData.findIndex((u) => u.name === 'Scorpion Tank')
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')

const COLS = 5

const makeMap = (): MapObject =>
	({
		cols: COLS,
		rows: 5,
		layers: {
			ground: new Array(25).fill(0).map(() => ({ type: PLAINS, state: 0 })),
			sky: new Array(25).fill(null),
			units: new Array(25).fill(null),
			buildings: new Array(25).fill(null),
		},
		highlights: [],
		route: [],
		pathHistory: [],
		filters: {} as any,
	}) as MapObject

const tank = (team: number): UnitObject => ({
	type: SCORPION_TANK,
	state: 0,
	team,
	health: unitData[SCORPION_TANK].health,
})

/**
 * Record every route the animator is handed while an action plays. The overlay
 * store is what actually drives the on-screen slide, so this is the observer's
 * view of which road the unit took.
 */
const recordRoutes = () => {
	const seen: number[][] = []
	const stop = routeAnimation.subscribe((value) => {
		if (value) seen.push([...value.route])
	})
	return { seen, stop }
}

/**
 * Two tiles that are a diagonal apart have (at least) two equal-cost L-shaped
 * routes between them across open plains, and `pathFinder` can only ever return
 * one of them: it expands -cols before +1, so it settles the vertical-first leg
 * and the horizontal-first one is unreachable through it. That is exactly the
 * ambiguity a relayed move used to be resolved by on every OTHER client — the
 * player steered one way and everybody else was shown the other.
 */
describe('remote move choreography', () => {
	beforeEach(() => {
		resetGameState()
	})
	afterEach(() => {
		routeAnimation.set(null)
	})

	it('pathfinding alone picks the vertical-first leg', () => {
		const map = makeMap()
		map.layers.units[12] = tank(0)
		// 12 -> 8 is one tile up and one tile right.
		expect(pathFinder(map, map.layers.units[12]!, 12, 8)).toEqual([12, 7, 8])
	})

	it('walks the route the sender relayed, not one of its own', async () => {
		const map = makeMap()
		map.layers.units[12] = tank(1)
		initGameStateFromMap(map)
		const { seen, stop } = recordRoutes()

		// The sender went right, THEN up — the opposite leg to the one pathfinding
		// would rebuild from from/to alone.
		await animateRemoteAction(map, { kind: 'move', from: 12, to: 8, path: [12, 13, 8] })
		stop()

		expect(seen).toContainEqual([12, 13, 8])
		expect(seen).not.toContainEqual([12, 7, 8])
		// State still lands where the action says, route or no route.
		expect(map.layers.units[8]).not.toBeNull()
		expect(map.layers.units[12]).toBeNull()
	})

	it('falls back to pathfinding for a legacy move with no route', async () => {
		const map = makeMap()
		map.layers.units[12] = tank(1)
		initGameStateFromMap(map)
		const { seen, stop } = recordRoutes()

		await animateRemoteAction(map, { kind: 'move', from: 12, to: 8 })
		stop()

		expect(seen).toContainEqual([12, 7, 8])
		expect(map.layers.units[8]).not.toBeNull()
	})

	/**
	 * The route only ever reaches us as choreography from another client, and the
	 * server can't fully check it (it has no board, so it can't check that the
	 * steps join up). A route with a jump in it is discarded rather than flown
	 * across the map.
	 */
	it('discards a relayed route whose steps do not join up', async () => {
		const map = makeMap()
		map.layers.units[12] = tank(1)
		initGameStateFromMap(map)
		const { seen, stop } = recordRoutes()

		// 12 -> 0 is not a step, and 0 -> 8 is not a step either.
		await animateRemoteAction(map, { kind: 'move', from: 12, to: 8, path: [12, 0, 8] })
		stop()

		expect(seen).not.toContainEqual([12, 0, 8])
		expect(seen).toContainEqual([12, 7, 8])
	})

	/** A route that wraps the grid edge is a jump, not a step. */
	it('discards a relayed route that wraps a row edge', async () => {
		const map = makeMap()
		map.layers.units[12] = tank(1)
		initGameStateFromMap(map)
		const { seen, stop } = recordRoutes()

		// 10 -> 9 is +1/-1 in index but crosses from column 0 to column 4.
		await animateRemoteAction(map, { kind: 'move', from: 12, to: 9, path: [12, 11, 10, 9] })
		stop()

		expect(seen).not.toContainEqual([12, 11, 10, 9])
		expect(map.layers.units[9]).not.toBeNull()
	})
})
