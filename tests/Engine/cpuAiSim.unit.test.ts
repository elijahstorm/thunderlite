// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { get } from 'svelte/store'
import { writeFileSync } from 'node:fs'

vi.mock('../../src/lib/Engine/Animator/animator', () => ({
	animateRoute: () => Promise.resolve(),
	animateHealthBar: () => Promise.resolve(),
	animateExplosion: () => Promise.resolve(),
	panBoardToBuiltUnit: () => false,
}))
vi.mock('../../src/lib/Audio/audioEngine', () => ({ audioEngine: { playSfx: () => {} } }))

import { applyAction } from '../../src/lib/Engine/applyAction'
import { endTurn } from '../../src/lib/Engine/turnLoop'
import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { bestPlanFor } from '../../src/lib/Engine/cpuAi/candidates'
import { pickBuildOnce } from '../../src/lib/Engine/cpuAi/production'
import {
	beginCpuPlanning,
	endCpuPlanning,
	planningUnits,
} from '../../src/lib/Engine/cpuAi/planningContext'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'
import type { SerializedAction } from '../../src/lib/Engine/Interactor/serializedAction'

/**
 * Headless CPU-vs-CPU simulation.
 *
 * Unit tests pin individual scoring decisions; this exercises the planner the way a
 * real match does — a whole army, over dozens of turns, with an economy and an
 * opponent — and measures the emergent behaviour that per-decision tests cannot see.
 * It exists because the AI pass that came out of the match-19 analysis was tuned
 * against numbers from here rather than by eye, and every one of those numbers needs
 * something that will notice when it drifts back.
 *
 * The board is a mirrored two-corner map with a deliberate one-tile chokepoint, which
 * is the situation that exposed most of the original problems: a long approach, a
 * narrow front, and enough income to keep both sides producing.
 *
 * It doubles as the tuning harness. Set `AI_SIM_DUMP=/path/report.json` to write the
 * full action log and per-turn metrics for offline comparison; without it the run is
 * silent and just asserts that the planner still behaves.
 */

const T = (name: string) => unitData.findIndex((u) => u.name === name)
const B = (name: string) => buildingData.findIndex((b) => b.name === name)
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const SEA = terrainData.findIndex((t) => t.name === 'Sea')

const COLS = 12
const ROWS = 12
const N = COLS * ROWS
const at = (x: number, y: number) => y * COLS + x
const dist = (a: number, b: number) =>
	Math.abs((a % COLS) - (b % COLS)) + Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS))

/**
 * Mirrored corners with a sea wall down the middle, open only at the top and bottom
 * edges. Both sides get one factory, one control building, two refineries and two
 * starting infantry; two neutral cities sit on the midline as contested income.
 */
const buildBoard = (): MapObject => {
	const map = {
		cols: COLS,
		rows: ROWS,
		layers: {
			ground: new Array(N).fill(0).map(() => ({ type: PLAINS, state: 0 })),
			sky: new Array(N).fill(null),
			units: new Array(N).fill(null),
			buildings: new Array(N).fill(null),
		},
		highlights: new Array(N),
		route: [],
		pathHistory: [],
	} as unknown as MapObject

	// Sea wall on the centre columns, leaving row 0 and row 11 as the only crossings.
	for (let y = 1; y < ROWS - 1; y++) {
		map.layers.ground[at(5, y)] = { type: SEA, state: 0 }
		map.layers.ground[at(6, y)] = { type: SEA, state: 0 }
	}

	const put = (tile: number, type: number, team: number) => {
		map.layers.buildings[tile] = {
			type,
			state: 0,
			team,
			stature: buildingData[type].stature,
		} as BuildingObject
	}
	const spawn = (tile: number, type: number, team: number) => {
		map.layers.units[tile] = {
			type,
			state: 0,
			team,
			health: unitData[type].health,
		} as UnitObject
	}

	for (const [team, ox] of [
		[0, 0],
		[1, 1],
	] as const) {
		// Mirror x across the board for team 1.
		const mx = (x: number) => (ox === 0 ? x : COLS - 1 - x)
		put(at(mx(1), 1), B('Warfactory'), team)
		put(at(mx(2), 2), B('Ground Control'), team)
		put(at(mx(1), 4), B('Oil Refinery'), team)
		put(at(mx(3), 8), B('Oil Refinery'), team)
		spawn(at(mx(2), 1), T('Strike Commando'), team)
		spawn(at(mx(1), 3), T('Strike Commando'), team)
	}
	put(at(5, 0), B('City'), 4)
	put(at(6, 11), B('City'), 4)

	return map
}

/** Headless equivalent of `runCpuTurn`'s tick loop: no animation, no relay. */
const runCpuTurnSync = (
	map: MapObject,
	team: number,
	onAction: (action: SerializedAction, before: (UnitObject | null)[]) => void
): void => {
	for (let guard = 0; guard < 400; guard++) {
		let best: { score: number; actions: SerializedAction[] } | null = null
		beginCpuPlanning(map)
		try {
			const acted = get(gameState).actedTiles
			for (const { tile, unit } of planningUnits(map)) {
				if (unit.team !== team || acted.has(tile)) continue
				const plan = bestPlanFor(map, tile, unit, team)
				if (plan && (!best || plan.score > best.score)) best = plan
			}
		} finally {
			endCpuPlanning()
		}
		const actions = best?.actions ?? []
		if (actions.length === 0) {
			const build = pickBuildOnce(map, team)
			if (!build) return
			const before = map.layers.units.slice()
			applyAction(map, build)
			onAction(build, before)
			continue
		}
		for (const action of actions) {
			const before = map.layers.units.slice()
			applyAction(map, action)
			onAction(action, before)
		}
	}
}

type Metrics = {
	builds: number
	spend: number
	attacks: number
	kills: number
	/** Attacks after which the attacker itself was dead — walked into a counter. */
	tradedSelf: number
	losses: number
	/** Build slots that existed at the start of a turn, whether or not they were used. */
	slots: number
	bankSum: number
	turns: number
	/** Unit-turns ending within 3 tiles of an enemy with fewer than 2 friendlies near. */
	inContact: number
	unsupported: number
	/** Distinct unit types purchased, by name. */
	types: Record<string, number>
}

const emptyMetrics = (): Metrics => ({
	builds: 0,
	spend: 0,
	attacks: 0,
	kills: 0,
	tradedSelf: 0,
	losses: 0,
	slots: 0,
	bankSum: 0,
	turns: 0,
	inContact: 0,
	unsupported: 0,
	types: {},
})

const runSim = (rounds: number) => {
	const map = buildBoard()
	initGameStateFromMap(map)
	const teams = [0, 1]
	const metrics: Record<number, Metrics> = { 0: emptyMetrics(), 1: emptyMetrics() }
	const log: unknown[] = []

	const noteTurnStart = (team: number) => {
		const m = metrics[team]
		m.turns++
		m.bankSum += get(gameState).players.find((p) => p.team === team)?.money ?? 0
		for (let t = 0; t < map.layers.buildings.length; t++) {
			const b = map.layers.buildings[t]
			if (b && b.team === team && buildingData[b.type]?.actable) m.slots++
		}
	}

	const noteTurnEnd = (team: number) => {
		const m = metrics[team]
		for (let t = 0; t < map.layers.units.length; t++) {
			const u = map.layers.units[t]
			if (!u || u.team !== team) continue
			let foes = 0
			let friends = 0
			for (let o = 0; o < map.layers.units.length; o++) {
				const v = map.layers.units[o]
				if (!v || o === t || dist(t, o) > 3) continue
				if (v.team === team) friends++
				else foes++
			}
			if (foes === 0) continue
			m.inContact++
			if (friends < 2) m.unsupported++
		}
	}

	for (let i = 0; i < rounds * teams.length; i++) {
		const state = get(gameState)
		if (state.phase !== 'playing') break
		const team = state.currentTeam
		const round = state.turnNumber
		noteTurnStart(team)
		runCpuTurnSync(map, team, (action, before) => {
			const m = metrics[team]
			if (action.kind === 'build') {
				m.builds++
				m.spend += unitData[action.unitType]?.cost ?? 0
				const name = unitData[action.unitType]?.name ?? String(action.unitType)
				m.types[name] = (m.types[name] ?? 0) + 1
			}
			if (action.kind === 'attack') {
				m.attacks++
				if (!map.layers.units[action.to]) m.kills++
				if (!map.layers.units[action.from]) m.tradedSelf++
			}
			const moveFrom = action.kind === 'move' ? action.from : -1
			for (let t = 0; t < before.length; t++) {
				const was = before[t]
				if (!was || map.layers.units[t] || t === moveFrom) continue
				if (metrics[was.team]) metrics[was.team].losses++
			}
			if (process.env.AI_SIM_DUMP) {
				log.push({
					round,
					team,
					action,
					unit: action.kind === 'build' ? unitData[action.unitType]?.name : undefined,
				})
			}
		})
		noteTurnEnd(team)
		endTurn({ map })
	}

	if (process.env.AI_SIM_DUMP) {
		writeFileSync(process.env.AI_SIM_DUMP, JSON.stringify({ metrics, log }, null, 1))
	}
	return { map, metrics, rounds: get(gameState).turnNumber }
}

describe('CPU vs CPU simulation', () => {
	const { metrics, rounds } = runSim(24)
	const both = [metrics[0], metrics[1]]

	it('plays a full match without stalling', () => {
		// The turn rotation has to keep advancing: a planner that throws, or one whose
		// tick loop never runs dry, would leave this far short.
		expect(rounds).toBeGreaterThan(20)
	})

	it('keeps its factories producing instead of banking the money', () => {
		// Guards the own-factory-block fix. A CPU whose units park on their own
		// Warfactory leaves most of its build slots unused and accumulates cash it has
		// no way to spend, which is exactly what a four-way sim showed before the fix
		// (12 of 30 slots used, average bank $2,266).
		for (const m of both) {
			expect(m.builds / m.slots).toBeGreaterThan(0.5)
			expect(m.bankSum / m.turns).toBeLessThan(1500)
		}
	})

	it('engages rather than milling about', () => {
		const attacks = both.reduce((sum, m) => sum + m.attacks, 0)
		const kills = both.reduce((sum, m) => sum + m.kills, 0)
		expect(attacks).toBeGreaterThan(10)
		expect(kills).toBeGreaterThan(3)
	})

	it('does not throw units away on attacks it dies to', () => {
		// Guards the trade-valuation fix. In the real match this ran at 20% for one side
		// and 19% for the other, and 39% of ALL deaths were attackers walking into a
		// counter. Some self-trades are correct (a cheap unit finishing an expensive
		// one), so this is a ceiling, not a target of zero.
		for (const m of both) {
			if (m.attacks < 5) continue
			expect(m.tradedSelf / m.attacks).toBeLessThan(0.18)
		}
	})

	it('fields more than one kind of unit', () => {
		// Guards the cost-aware production pass. Before it, both sides bought the same
		// single highest-stat unit every turn for fourteen rounds running, on both of
		// the two boards this was measured on.
		for (const m of both) expect(Object.keys(m.types).length).toBeGreaterThanOrEqual(2)
	})
})
