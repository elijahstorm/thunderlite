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

import { applyAction } from '../../src/lib/Engine/applyAction'
import { endTurn } from '../../src/lib/Engine/turnLoop'
import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { bestPlanFor } from '../../src/lib/Engine/cpuAi/candidates'
import {
	beginCpuPlanning,
	endCpuPlanning,
	planningUnits,
} from '../../src/lib/Engine/cpuAi/planningContext'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

/**
 * The corner-camping match: the CPU holds a Command Center and nothing else, so it can
 * never build a single unit, and every turn it spends gathering is a turn its army is
 * dismantled for free. Before the massing gate (cpuAi/growth.ts) the force ratio term
 * read the enemy line, decided it was outmatched, and waited for reinforcements that
 * could not exist. Before the flocking terms (cohesion in cpuAi/score.ts) the
 * Annihilator Tank — the one unit the ratio term never lets off the leash — sat at
 * home while the Scorpions it was supposed to anchor left without it.
 *
 * This drives the real planner over the real board and checks both: the army closes,
 * and the heavy closes *with* it.
 */

const T = (name: string) => unitData.findIndex((u) => u.name === name)
const B = (name: string) => buildingData.findIndex((b) => b.name === name)
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')

const COLS = 18
const ROWS = 9
const N = COLS * ROWS
const at = (x: number, y: number) => y * COLS + x
const dist = (a: number, b: number) =>
	Math.abs((a % COLS) - (b % COLS)) + Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS))

const CPU = 1
const FOE = 0

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

	// Neither side owns anything actable: a Command Center each, no factory, no
	// control building, no income. Whatever is on the board is the whole war.
	put(at(1, 4), B('Command Center'), CPU)
	put(at(COLS - 2, 4), B('Command Center'), FOE)

	spawn(at(2, 4), T('Annihilator Tank'), CPU)
	spawn(at(2, 3), T('Scorpion Tank'), CPU)
	spawn(at(2, 5), T('Scorpion Tank'), CPU)
	spawn(at(3, 4), T('Scorpion Tank'), CPU)

	spawn(at(COLS - 3, 3), T('Scorpion Tank'), FOE)
	spawn(at(COLS - 3, 4), T('Annihilator Tank'), FOE)
	spawn(at(COLS - 3, 5), T('Scorpion Tank'), FOE)

	return map
}

/** Headless equivalent of `runCpuTurn`'s tick loop: no animation, no relay. */
const runCpuTurnSync = (map: MapObject, team: number): void => {
	for (let guard = 0; guard < 200; guard++) {
		let best: { score: number; actions: ReturnType<typeof bestPlanFor> } | null = null
		beginCpuPlanning(map)
		try {
			const acted = get(gameState).actedTiles
			for (const { tile, unit } of planningUnits(map)) {
				if (unit.team !== team || acted.has(tile)) continue
				const plan = bestPlanFor(map, tile, unit, team)
				if (plan && (!best || plan.score > best.score)) best = { score: plan.score, actions: plan }
			}
		} finally {
			endCpuPlanning()
		}
		const actions = best?.actions?.actions ?? []
		if (actions.length === 0) return
		for (const action of actions) applyAction(map, action)
	}
}

type Snapshot = { cpuFront: number; anniToPack: number; cpuAlive: number; foeAlive: number }

const play = (rounds: number): Snapshot[] => {
	const map = buildBoard()
	initGameStateFromMap(map)
	const anni = T('Annihilator Tank')
	const snapshots: Snapshot[] = []

	for (let round = 0; round < rounds; round++) {
		for (const team of [CPU, FOE]) {
			if (get(gameState).currentTeam !== team) continue
			runCpuTurnSync(map, team)
			endTurn({ map })
		}
		// How far the CPU's leading unit has pushed (x of the most advanced), and how
		// far its Annihilator sits from the rest of its own army.
		let front = 0
		let anniTile = -1
		let cpuAlive = 0
		let foeAlive = 0
		const pack: number[] = []
		for (let t = 0; t < N; t++) {
			const u = map.layers.units[t]
			if (!u) continue
			if (u.team !== CPU) {
				foeAlive++
				continue
			}
			cpuAlive++
			front = Math.max(front, t % COLS)
			if (u.type === anni) anniTile = t
			else pack.push(t)
		}
		const anniToPack =
			anniTile >= 0 && pack.length > 0 ? Math.min(...pack.map((t) => dist(t, anniTile))) : 0
		snapshots.push({ cpuFront: front, anniToPack, cpuAlive, foeAlive })
	}
	return snapshots
}

describe('CPU with no way to reinforce', () => {
	const snapshots = play(8)

	it('advances instead of camping its corner', () => {
		// It starts at x=3. A CPU that waits for a mass that can never arrive never leaves
		// its corner. One that spends its first-strike edge either reaches the enemy half
		// or meets the enemy line short of it and destroys it there — measured over the
		// whole run, not off the final frame, because once the enemy army is gone there is
		// nothing left to advance toward and the front stops wherever the last fight was.
		const peak = Math.max(...snapshots.map((s) => s.cpuFront))
		const wonTheField = snapshots.some((s) => s.foeAlive === 0)
		expect(peak).toBeGreaterThan(COLS / 3)
		expect(peak > COLS / 2 || wonTheField).toBe(true)
	})

	it('keeps pushing forward round on round rather than milling', () => {
		// Ground gained every round up to contact, not a shuffle around the same tiles.
		expect(snapshots[2].cpuFront).toBeGreaterThan(snapshots[1].cpuFront)
	})

	it('trades as an army instead of being picked off one at a time', () => {
		// The losing shape this came from: the pack leaves alone, dies piecemeal, and the
		// heavy is still at home when the last of it goes. Arriving together should keep
		// most of the army alive through the engagement.
		const last = snapshots[snapshots.length - 1]
		expect(last.cpuAlive).toBeGreaterThanOrEqual(2)
		expect(last.foeAlive).toBeLessThan(last.cpuAlive)
	})

	it('brings the Annihilator Tank along with the pack', () => {
		// The reported failure was the heavy left behind at base while the Scorpions
		// went off to die one at a time. It should stay inside the flock the whole way.
		for (const snapshot of snapshots) expect(snapshot.anniToPack).toBeLessThanOrEqual(4)
	})
})
