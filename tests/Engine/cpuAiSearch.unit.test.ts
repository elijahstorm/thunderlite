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
import { endTurn } from '../../src/lib/Engine/turnLoop'
import { boardDigest } from '../../src/lib/Engine/boardDigest'
import { setMatchSeed } from '../../src/lib/Engine/matchSeed'
import { simulationActive } from '../../src/lib/Engine/shadowStore'
import {
	believedSnapshot,
	runGreedyTurn,
	simulateGreedyTurn,
	withSimulated,
} from '../../src/lib/Engine/cpuAi/sim'
import {
	applyTurnPlan,
	searchTurnSync,
	searchTurnAsync,
	generateTurnPlans,
	type SearchConfig,
} from '../../src/lib/Engine/cpuAi/search'
import { planningDepth } from '../../src/lib/Engine/cpuAi/planningContext'
import { sampleTeams } from '../../src/lib/Engine/matchTimeline'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

/**
 * The lookahead (cpuAi/search.ts).
 *
 * The search is deliberately lossy — a beam of whole-turn plans, alpha-beta over
 * them, greedy as the floor — so these pin the properties that make it safe rather
 * than any particular move: it is reproducible under a node budget, it never leaks a
 * planning window or touches the live board, its answer is never rated below greedy's,
 * it sees a one-turn trap greedy walks into, and over a set of seeded matches it does
 * not lose to the greedy policy it is built on.
 */

const T = (name: string) => unitData.findIndex((u) => u.name === name)
const B = (name: string) => buildingData.findIndex((b) => b.name === name)
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')

const makeMap = (cols: number, rows: number): MapObject => {
	const n = cols * rows
	return {
		cols,
		rows,
		layers: {
			ground: new Array(n).fill(0).map(() => ({ type: PLAINS, state: 0 })),
			sky: new Array(n).fill(null),
			units: new Array(n).fill(null),
			buildings: new Array(n).fill(null),
		},
		filters: { ground: () => [], sky: () => [], units: () => [], buildings: () => [] },
		highlights: new Array(n),
		route: [],
		pathHistory: [],
	} as unknown as MapObject
}

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

const CFG: SearchConfig = {
	maxDepth: 2,
	K: 3,
	B: 6,
	Bopp: 3,
	contactRadius: 6,
	budget: { nodes: 150 },
}

/** A small two-army board with a factory each, the CPU (team 1) to move. */
const skirmish = () => {
	const COLS = 10
	const at = (x: number, y: number) => y * COLS + x
	const map = makeMap(COLS, 7)
	building(map, at(0, 3), B('Warfactory'), 1)
	building(map, at(9, 3), B('Warfactory'), 0)
	building(map, at(1, 1), B('Ground Control'), 1)
	building(map, at(8, 5), B('Ground Control'), 0)
	place(map, at(2, 2), T('Scorpion Tank'), 1)
	place(map, at(2, 4), T('Strike Commando'), 1)
	place(map, at(3, 3), T('Heavy Commando'), 1)
	place(map, at(6, 2), T('Scorpion Tank'), 0)
	place(map, at(6, 4), T('Strike Commando'), 0, 20)
	place(map, at(7, 3), T('Heavy Commando'), 0)
	map.funds = 600
	initGameStateFromMap(map)
	gameState.update((s) => ({ ...s, currentTeam: 1 }))
	return map
}

describe('searchTurn', () => {
	it('is reproducible under a node budget and leaves the live board untouched', () => {
		setMatchSeed(12345)
		const map = skirmish()
		const before = boardDigest(map)
		const board = believedSnapshot(map, 1)
		const a = searchTurnSync(board, 1, CFG)
		const b = searchTurnSync(believedSnapshot(map, 1), 1, CFG)
		expect(a.plan.label).toBe(b.plan.label)
		expect(a.telemetry.plans).toEqual(b.telemetry.plans)
		expect(a.telemetry.nodes).toBe(b.telemetry.nodes)
		expect(a.telemetry.nodes).toBeGreaterThan(0)
		expect(a.telemetry.nodes).toBeLessThanOrEqual(CFG.budget.nodes!)
		// Nothing leaked: no planning window left open, no shadow left up, board intact.
		expect(planningDepth()).toBe(0)
		expect(simulationActive()).toBe(false)
		expect(boardDigest(map)).toBe(before)
		expect(get(gameState).currentTeam).toBe(1)
		setMatchSeed(0)
	})

	it('never rates its answer below the greedy plan it starts from', () => {
		const map = skirmish()
		const result = searchTurnSync(believedSnapshot(map, 1), 1, CFG)
		expect(result.telemetry.depthCompleted).toBeGreaterThanOrEqual(1)
		expect(result.telemetry.chosenValue).not.toBeNull()
		expect(result.telemetry.chosenValue!).toBeGreaterThanOrEqual(result.telemetry.greedyValue!)
		expect(result.telemetry.rootPlans).toBeGreaterThan(1)
	})

	it('a tiny node budget still returns the greedy floor, truncated', () => {
		const map = skirmish()
		const result = searchTurnSync(believedSnapshot(map, 1), 1, { ...CFG, budget: { nodes: 1 } })
		expect(result.plan.label).toBe('greedy')
		expect(result.telemetry.truncated).toBe(true)
		expect(result.telemetry.depthCompleted).toBe(0)
	})

	it('sees the reply: it declines a kill that hands the killer to two heavies', () => {
		// Open plains. The CPU Scorpion can finish a nearly dead commando at x=5, but
		// every firing tile (x >= 4) is one move from two enemy Annihilators (movement
		// 4, sitting at x=8); anything at x <= 3 is out of their reach. The greedy
		// threat term is stationary and misses movers, so greedy takes the kill and
		// loses a $270 tank for a $15 scrap. Depth 2 plays the reply and sees it.
		const COLS = 12
		const at = (x: number, y: number) => y * COLS + x
		const scorpionX = (board: ReturnType<typeof believedSnapshot>) => {
			const tile = board.map.layers.units.findIndex((u) => u?.team === 1)
			return tile % COLS
		}
		const map = makeMap(COLS, 5)
		building(map, at(0, 2), B('Command Center'), 1)
		building(map, at(11, 2), B('Command Center'), 0)
		place(map, at(2, 2), T('Scorpion Tank'), 1)
		place(map, at(5, 2), T('Strike Commando'), 0, 8)
		place(map, at(8, 1), T('Annihilator Tank'), 0)
		place(map, at(8, 3), T('Annihilator Tank'), 0)
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, currentTeam: 1 }))

		// Greedy walks in and shoots.
		const greedyBoard = believedSnapshot(map, 1)
		const greedyLog = simulateGreedyTurn(greedyBoard, 1)
		expect(greedyLog.some((a) => a.kind === 'attack')).toBe(true)
		expect(scorpionX(greedyBoard)).toBeGreaterThanOrEqual(4)

		// The search stays out of reach.
		const result = searchTurnSync(believedSnapshot(map, 1), 1, {
			...CFG,
			B: 8,
			budget: { nodes: 300 },
		})
		expect(result.telemetry.depthCompleted).toBe(2)
		expect(result.plan.label).not.toBe('greedy')
		expect(result.telemetry.chosenValue!).toBeGreaterThan(result.telemetry.greedyValue!)
		const searched = believedSnapshot(map, 1)
		withSimulated(searched, (m) => applyTurnPlan(m, 1, result.plan))
		expect(scorpionX(searched)).toBeLessThanOrEqual(3)
	})

	it('drains asynchronously to the same answer', async () => {
		const map = skirmish()
		const sync = searchTurnSync(believedSnapshot(map, 1), 1, CFG)
		const async = await searchTurnAsync(believedSnapshot(map, 1), 1, CFG, { sliceMs: 0 })
		expect(async.plan.label).toBe(sync.plan.label)
		expect(async.telemetry.nodes).toBe(sync.telemetry.nodes)
	})

	it('a stop request returns the best completed iteration', async () => {
		const map = skirmish()
		let calls = 0
		const result = await searchTurnAsync(
			believedSnapshot(map, 1),
			1,
			{ ...CFG, maxDepth: 3, budget: {} },
			{ stop: () => ++calls > 20 }
		)
		expect(result.telemetry.truncated).toBe(true)
		expect(result.plan).toBeDefined()
	})
})

describe('generateTurnPlans', () => {
	it('starts with greedy and never repeats a plan', () => {
		const map = skirmish()
		const plans = generateTurnPlans(map, 1, 8, CFG, [1, 1, 0])
		expect(plans[0].label).toBe('greedy')
		expect(plans[0].overrides).toEqual([])
		const labels = plans.map((p) => p.label)
		expect(new Set(labels).size).toBe(labels.length)
		expect(plans.length).toBeLessThanOrEqual(8)
	})
})

describe('search vs greedy', () => {
	/**
	 * Headless CPU vs CPU: one seat searches (depth 2, node budget), the other plays
	 * greedy. Seats alternate across seeds so a map asymmetry can't decide it.
	 */
	const play = (seed: number, searchTeam: number, rounds: number) => {
		setMatchSeed(seed)
		const map = skirmish()
		for (let i = 0; i < rounds * 2; i++) {
			const state = get(gameState)
			if (state.phase !== 'playing') break
			const team = state.currentTeam
			if (team === searchTeam) {
				const result = searchTurnSync(believedSnapshot(map, team), team, {
					...CFG,
					budget: { nodes: 120 },
				})
				applyTurnPlan(map, team, result.plan)
			} else {
				runGreedyTurn(map, team)
			}
			endTurn({ map })
		}
		const state = get(gameState)
		const samples = sampleTeams(map, state)
		const strength = (team: number) => samples[team].army + samples[team].funds
		setMatchSeed(0)
		return {
			winner: state.phase === 'gameOver' ? state.winner : null,
			gap: strength(searchTeam) - strength(1 - searchTeam),
		}
	}

	it('does not lose to the policy it is built on over seeded matches', () => {
		const games = [1, 2, 3, 4].map((seed) => play(seed, seed % 2, 10))
		const wins = games.filter((g) => g.winner !== null && g.gap > 0).length
		const losses = games.filter((g) => g.winner !== null && g.gap < 0).length
		const meanGap = games.reduce((sum, g) => sum + g.gap, 0) / games.length
		expect(wins).toBeGreaterThanOrEqual(losses)
		expect(meanGap).toBeGreaterThanOrEqual(0)
	})
})
