// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../../src/lib/Engine/Animator/animator', () => ({
	animateRoute: () => Promise.resolve(),
	animateHealthBar: () => Promise.resolve(),
	animateExplosion: () => Promise.resolve(),
	panBoardToBuiltUnit: () => false,
}))
vi.mock('../../src/lib/Audio/audioEngine', () => ({ audioEngine: { playSfx: () => {} } }))

import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { smokeTiles, addSmoke } from '../../src/lib/Engine/smokeState'
import { shadowable, simulationActive } from '../../src/lib/Engine/shadowStore'
import { boardDigest, boardSnapshot } from '../../src/lib/Engine/boardDigest'
import {
	snapshot,
	cloneBoard,
	withSimulated,
	simulateGreedyTurn,
	simulateEndTurn,
	applySimulated,
} from '../../src/lib/Engine/cpuAi/sim'
import {
	beginCpuPlanning,
	endCpuPlanning,
	planningUnits,
	planningDepth,
} from '../../src/lib/Engine/cpuAi/planningContext'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

/**
 * The headless simulation substrate (cpuAi/sim.ts + shadowStore.ts).
 *
 * The lookahead applies whole turns to copies of the board. These prove the copies
 * are genuinely private: a simulated ply leaves the live store, the live layers and
 * the live smoke byte-identical, subscribers never hear a simulated value, and a
 * planning window opened on a clone can't clobber the one open on the real board.
 */

const T = (name: string) => unitData.findIndex((u) => u.name === name)
const B = (name: string) => buildingData.findIndex((b) => b.name === name)
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')

const COLS = 8
const ROWS = 6
const N = COLS * ROWS
const at = (x: number, y: number) => y * COLS + x

const makeMap = (): MapObject =>
	({
		cols: COLS,
		rows: ROWS,
		layers: {
			ground: new Array(N).fill(0).map(() => ({ type: PLAINS, state: 0 })),
			sky: new Array(N).fill(null),
			units: new Array(N).fill(null),
			buildings: new Array(N).fill(null),
		},
		filters: { ground: () => [], sky: () => [], units: () => [], buildings: () => [] },
		highlights: new Array(N),
		route: [],
		pathHistory: [],
	}) as unknown as MapObject

const place = (map: MapObject, tile: number, type: number, team: number, health?: number) => {
	map.layers.units[tile] = {
		type,
		state: 0,
		team,
		health: health ?? unitData[type].health,
	} as UnitObject
}

const building = (map: MapObject, tile: number, type: number, team: number) => {
	map.layers.buildings[tile] = {
		type,
		state: 0,
		team,
		stature: buildingData[type].stature,
	} as BuildingObject
}

/** A live board with something to do: two armies, a factory each, some money. */
const liveBoard = () => {
	const map = makeMap()
	building(map, at(0, 2), B('Warfactory'), 0)
	building(map, at(7, 3), B('Warfactory'), 1)
	building(map, at(1, 1), B('Ground Control'), 0)
	building(map, at(6, 4), B('Ground Control'), 1)
	place(map, at(2, 2), T('Scorpion Tank'), 0)
	place(map, at(3, 3), T('Strike Commando'), 0)
	place(map, at(5, 2), T('Scorpion Tank'), 1, 40)
	place(map, at(4, 3), T('Strike Commando'), 1)
	map.funds = 1000
	initGameStateFromMap(map)
	gameState.update((s) => ({ ...s, currentTeam: 1 }))
	return map
}

describe('shadowable store', () => {
	it('reads and writes the shadow while installed, and nobody is notified', () => {
		const store = shadowable({ n: 1 })
		const seen: number[] = []
		store.subscribe((v) => seen.push(v.n))
		expect(seen).toEqual([1])

		const prev = store.installShadow({ n: 10 })
		expect(prev).toBeNull()
		expect(get(store).n).toBe(10)
		store.update((v) => ({ n: v.n + 1 }))
		expect(get(store).n).toBe(11)
		expect(seen).toEqual([1]) // subscriber heard nothing
		expect(store.live().n).toBe(1)
		expect(simulationActive()).toBe(true)

		const final = store.liftShadow(prev)
		expect(final.n).toBe(11)
		expect(get(store).n).toBe(1)
		expect(simulationActive()).toBe(false)

		store.set({ n: 2 })
		expect(seen).toEqual([1, 2])
	})

	it('nests: lifting an inner shadow restores the outer one', () => {
		const store = shadowable(0)
		const a = store.installShadow(1)
		const b = store.installShadow(2)
		expect(get(store)).toBe(2)
		store.liftShadow(b)
		expect(get(store)).toBe(1)
		store.liftShadow(a)
		expect(get(store)).toBe(0)
	})
})

describe('withSimulated', () => {
	it('a simulated greedy turn plus end-turn leaves the live board and store byte-identical', () => {
		const map = liveBoard()
		addSmoke([at(4, 4)], 3)
		const liveBefore = boardSnapshot(map)
		const digestBefore = boardDigest(map)
		const smokeBefore = new Map(get(smokeTiles))
		const layersBefore = JSON.stringify(map.layers)
		const stateBefore = JSON.stringify(get(gameState), (_k, v) => (v instanceof Set ? [...v] : v))

		const board = snapshot(map)
		const actions = simulateGreedyTurn(board, 1)
		simulateEndTurn(board)

		// The simulation actually did things...
		expect(actions.length).toBeGreaterThan(0)
		expect(board.state.currentTeam).toBe(0)
		expect(board.state.actedTiles.size).toBe(0)
		const simDigest = withSimulated(board, (m) => boardDigest(m))
		expect(simDigest).not.toBe(digestBefore)
		// ...its smoke aged...
		expect(board.smoke.get(at(4, 4))).toBe(2)

		// ...and the live match never noticed.
		expect(boardSnapshot(map)).toBe(liveBefore)
		expect(boardDigest(map)).toBe(digestBefore)
		expect(JSON.stringify(map.layers)).toBe(layersBefore)
		expect(JSON.stringify(get(gameState), (_k, v) => (v instanceof Set ? [...v] : v))).toBe(
			stateBefore
		)
		expect(get(smokeTiles)).toEqual(smokeBefore)
		expect(simulationActive()).toBe(false)
	})

	it('live subscribers never hear a simulated state', () => {
		const map = liveBoard()
		const heard: number[] = []
		const stop = gameState.subscribe((s) => heard.push(s.currentTeam))
		const board = snapshot(map)
		simulateGreedyTurn(board, 1)
		simulateEndTurn(board)
		stop()
		expect(heard).toEqual([1])
	})

	it('cloneBoard forks a node: the child evolves and the parent stays put', () => {
		const map = liveBoard()
		const parent = snapshot(map)
		const parentDigest = withSimulated(parent, (m) => boardDigest(m))
		const child = cloneBoard(parent)
		expect(child.map).not.toBe(parent.map)
		expect(child.map.layers).not.toBe(parent.map.layers)
		simulateGreedyTurn(child, 1)
		expect(withSimulated(parent, (m) => boardDigest(m))).toBe(parentDigest)
		expect(withSimulated(child, (m) => boardDigest(m))).not.toBe(parentDigest)
	})

	it('a simulated wait still flips the acted set on the copy, not on the live state', () => {
		const map = liveBoard()
		const board = snapshot(map)
		withSimulated(board, (m) => applySimulated(m, { kind: 'wait', tile: at(5, 2) }))
		expect(board.state.actedTiles.has(at(5, 2))).toBe(true)
		expect(get(gameState).actedTiles.has(at(5, 2))).toBe(false)
	})
})

describe('planning context stack', () => {
	it('a nested window on a clone does not clobber the parent window', () => {
		const map = liveBoard()
		beginCpuPlanning(map)
		try {
			const parentUnits = planningUnits(map)
			expect(planningDepth()).toBe(1)
			const board = snapshot(map)
			withSimulated(board, (m) => {
				beginCpuPlanning(m)
				try {
					expect(planningDepth()).toBe(2)
					// The child sees its own board's list, not the parent's memo.
					const childUnits = planningUnits(m)
					expect(childUnits).not.toBe(parentUnits)
					expect(childUnits.length).toBe(parentUnits.length)
				} finally {
					endCpuPlanning()
				}
			})
			expect(planningDepth()).toBe(1)
			// The parent's memo is still the parent's: same array instance.
			expect(planningUnits(map)).toBe(parentUnits)
		} finally {
			endCpuPlanning()
		}
		expect(planningDepth()).toBe(0)
	})
})
