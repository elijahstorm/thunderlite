// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../../src/lib/Engine/Animator/animator', () => ({
	animateRoute: () => Promise.resolve(),
	animateHealthBar: () => Promise.resolve(),
	animateExplosion: () => Promise.resolve(),
	panBoardToBuiltUnit: () => false,
}))
vi.mock('../../src/lib/Audio/audioEngine', () => ({ audioEngine: { playSfx: () => {} } }))

import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { fogOfWarEnabled } from '../../src/lib/Engine/fogState'
import {
	evaluatePosition,
	evaluatePositionDetail,
	sampleBelievedTeams,
} from '../../src/lib/Engine/cpuAi/evaluatePosition'
import { sampleTeams } from '../../src/lib/Engine/matchTimeline'
import { snapshot, withSimulated, applySimulated } from '../../src/lib/Engine/cpuAi/sim'
import { DEFAULT_WEIGHTS } from '../../src/lib/Engine/cpuAi/weights'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

/**
 * The search's leaf evaluation (cpuAi/evaluatePosition.ts): believed material in
 * the same units as the results chart, the positional aggregate, tempo, and the
 * win / loss terminal. These pin the three properties the plan asked for: a hidden
 * enemy does not change the eval, killing a unit raises it by about its value, and
 * the terminal dominates everything else.
 */

const T = (name: string) => unitData.findIndex((u) => u.name === name)
const B = (name: string) => buildingData.findIndex((b) => b.name === name)
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')

const COLS = 14
const ROWS = 8
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
	const unit = { type, state: 0, team, health: health ?? unitData[type].health } as UnitObject
	map.layers.units[tile] = unit
	return unit
}

const building = (map: MapObject, tile: number, type: number, team: number) => {
	map.layers.buildings[tile] = {
		type,
		state: 0,
		team,
		stature: buildingData[type].stature,
	} as BuildingObject
}

const board = (enemyUnits = true) => {
	const map = makeMap()
	building(map, at(0, 3), B('Command Center'), 1)
	building(map, at(13, 3), B('Command Center'), 0)
	place(map, at(2, 3), T('Scorpion Tank'), 1)
	place(map, at(2, 5), T('Strike Commando'), 1)
	if (enemyUnits) {
		place(map, at(11, 3), T('Scorpion Tank'), 0)
		place(map, at(11, 5), T('Strike Commando'), 0)
	}
	initGameStateFromMap(map)
	gameState.update((s) => ({ ...s, currentTeam: 1 }))
	return map
}

afterEach(() => fogOfWarEnabled.set(false))

describe('sampleBelievedTeams', () => {
	it('matches the results chart when everything is visible', () => {
		const map = board()
		const believed = sampleBelievedTeams(map, get(gameState), 1)
		const chart = sampleTeams(map, get(gameState))
		for (const team of [0, 1]) {
			expect(believed[team].army).toBeCloseTo(chart[team].army, 0)
			expect(believed[team].funds).toBe(chart[team].funds)
		}
	})

	it('drops enemy units the observer cannot perceive, never its own', () => {
		const map = board()
		fogOfWarEnabled.set(true)
		const believed = sampleBelievedTeams(map, get(gameState), 1)
		// The enemy is nine tiles away, far outside a sight radius of 2–3: invisible.
		expect(believed[0].army).toBe(0)
		expect(believed[0].units).toBe(0)
		expect(believed[1].army).toBeGreaterThan(0)
	})
})

describe('evaluatePosition', () => {
	it('is unchanged by an enemy it cannot see', () => {
		const withEnemy = board()
		fogOfWarEnabled.set(true)
		const seen = evaluatePosition(withEnemy, 1)

		// A board where the enemy never fielded anything (so it isn't "defeated" — it
		// is still in its build phase): the CPU's view of the two must be identical.
		const without = board(false)
		fogOfWarEnabled.set(true)
		const blind = evaluatePosition(without, 1)
		expect(seen).toBeCloseTo(blind, 6)
	})

	it('rises by roughly the value of an enemy unit that dies', () => {
		const map = board()
		const before = evaluatePosition(map, 1)
		const victim = map.layers.units[at(11, 3)] as UnitObject
		const value = unitData[victim.type].cost
		map.layers.units[at(11, 3)] = null
		const after = evaluatePosition(map, 1)
		const delta = after - before
		expect(delta).toBeGreaterThan(value * 0.8)
		expect(delta).toBeLessThan(value * 1.5)
	})

	it('falls by roughly the value of one of its own units that dies', () => {
		const map = board()
		const before = evaluatePosition(map, 1)
		const value = unitData[(map.layers.units[at(2, 3)] as UnitObject).type].cost
		map.layers.units[at(2, 3)] = null
		const after = evaluatePosition(map, 1)
		expect(before - after).toBeGreaterThan(value * 0.8)
	})

	it('the terminal dominates: a won board beats any material, a lost one loses to any', () => {
		const map = board()
		const live = evaluatePosition(map, 1)
		expect(Math.abs(live)).toBeLessThan(DEFAULT_WEIGHTS.EVAL_TERMINAL / 10)

		const eliminate = (team: number) => {
			const sim = snapshot(map)
			sim.state = {
				...sim.state,
				players: sim.state.players.map((p) => (p.team === team ? { ...p, hasLost: true } : p)),
			}
			return sim
		}
		const winScore = withSimulated(eliminate(0), (m) => evaluatePosition(m, 1))
		expect(winScore).toBeGreaterThan(DEFAULT_WEIGHTS.EVAL_TERMINAL / 2)

		const lossScore = withSimulated(eliminate(1), (m) => evaluatePosition(m, 1))
		expect(lossScore).toBeLessThan(-DEFAULT_WEIGHTS.EVAL_TERMINAL / 2)
	})

	it('reads the simulated board, not the live one, inside withSimulated', () => {
		const map = board()
		const live = evaluatePositionDetail(map, 1)
		const sim = snapshot(map)
		// Kill the enemy tank on the copy only.
		withSimulated(sim, (m) => {
			m.layers.units[at(11, 3)] = null
			applySimulated(m, { kind: 'wait', tile: at(2, 3) })
		})
		const after = withSimulated(sim, (m) => evaluatePositionDetail(m, 1))
		expect(after.rivals).toBeLessThan(live.rivals)
		expect(evaluatePositionDetail(map, 1).rivals).toBe(live.rivals)
	})

	it('a fog hunch is charged as unseen enemy value', () => {
		const map = board()
		fogOfWarEnabled.set(true)
		const quiet = evaluatePosition(map, 1)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) => (p.team === 1 ? { ...p, fogBelief: { [at(7, 3)]: 1 } } : p)),
		}))
		const wary = evaluatePositionDetail(map, 1)
		expect(wary.phantom).toBeGreaterThan(0)
		expect(wary.score).toBeLessThan(quiet)
	})
})
