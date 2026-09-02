// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../../src/lib/Engine/Animator/animator', () => ({
	animateRoute: () => Promise.resolve(),
	animateBlocked: () => Promise.resolve(),
	animateHealthBar: () => Promise.resolve(),
	animateExplosion: () => Promise.resolve(),
	panBoardToBuiltUnit: () => false,
}))
vi.mock('../../src/lib/Engine/attackSequence', () => ({
	animateAttackSequence: async (
		_map: unknown,
		from: number,
		to: number,
		commit: (a: { kind: 'attack'; from: number; to: number }) => void
	) => {
		commit({ kind: 'attack', from, to })
	},
}))
vi.mock('../../src/lib/Audio/audioEngine', () => ({ audioEngine: { playSfx: () => {} } }))
vi.mock('../../src/lib/Audio/playActionSfx', () => ({ playActionSfx: () => {} }))

import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { outgoingActions } from '../../src/lib/Engine/outgoingActions'
import {
	runCpuTurn,
	liveSearchBudget,
	LIVE_SEARCH_BUDGET_MS,
	MAX_SEARCH_BUDGET_MS,
} from '../../src/lib/Engine/cpuAi'
import { searchTelemetry, type SearchTelemetry } from '../../src/lib/Engine/cpuAi/search'
import { DEFAULT_WEIGHTS } from '../../src/lib/Engine/cpuAi/weights'
import type { SerializedAction } from '../../src/lib/Engine/Interactor/serializedAction'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

/**
 * `runCpuTurn` with `policy: 'search'` (see cpuAi.ts): the lookahead runs first,
 * its overrides are dispatched through the ordinary funnel one action at a time,
 * the rest of the turn is greedy, a hidden tab takes the timer-free node budget,
 * cancel stops the search, and a plan the board no longer allows is dropped and the
 * turn re-searched or finished greedy.
 */

const T = (name: string) => unitData.findIndex((u) => u.name === name)
const B = (name: string) => buildingData.findIndex((b) => b.name === name)
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')

const COLS = 12
const ROWS = 5
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

/**
 * The trap from the search tests: greedy shoots the dying commando from x >= 4 and
 * loses its Scorpion to two Annihilators; the search steps back to x <= 3.
 */
const trap = () => {
	const map = makeMap()
	building(map, at(0, 2), B('Command Center'), 1)
	building(map, at(11, 2), B('Command Center'), 0)
	place(map, at(2, 2), T('Scorpion Tank'), 1)
	place(map, at(5, 2), T('Strike Commando'), 0, 8)
	place(map, at(8, 1), T('Annihilator Tank'), 0)
	place(map, at(8, 3), T('Annihilator Tank'), 0)
	initGameStateFromMap(map)
	gameState.update((s) => ({ ...s, currentTeam: 1 }))
	return map
}

const relayed = (): { log: SerializedAction[]; stop: () => void } => {
	const log: SerializedAction[] = []
	// A store replays its current value to a new subscriber: skip the previous
	// test's last action and record only what this turn relays.
	let initial = true
	const stop = outgoingActions.subscribe((a) => {
		if (initial) {
			initial = false
			return
		}
		if (a) log.push(a)
	})
	return { log, stop }
}

const untilEnded = (run: (onEnd: () => void) => void, timeoutMs = 5000): Promise<boolean> =>
	new Promise((resolve) => {
		const timer = setTimeout(() => resolve(false), timeoutMs)
		run(() => {
			clearTimeout(timer)
			resolve(true)
		})
	})

afterEach(() => {
	delete (globalThis as { document?: unknown }).document
	searchTelemetry.set(null)
})

describe('liveSearchBudget', () => {
	it('shrinks with the army and never approaches the stall watchdog', () => {
		expect(liveSearchBudget(LIVE_SEARCH_BUDGET_MS, 0)).toBe(LIVE_SEARCH_BUDGET_MS)
		expect(liveSearchBudget(LIVE_SEARCH_BUDGET_MS, 30)).toBeLessThan(LIVE_SEARCH_BUDGET_MS)
		expect(liveSearchBudget(LIVE_SEARCH_BUDGET_MS, DEFAULT_WEIGHTS.LAZY_PLAN_THRESHOLD)).toBe(
			LIVE_SEARCH_BUDGET_MS * 0.3
		)
		expect(liveSearchBudget(60_000, 0)).toBe(MAX_SEARCH_BUDGET_MS)
		expect(MAX_SEARCH_BUDGET_MS).toBeLessThan(45_000 / 2)
	})
})

describe("runCpuTurn with policy 'search'", () => {
	it('dispatches the searched plan first, then ends the turn', async () => {
		const map = trap()
		const { log, stop } = relayed()
		let telemetry: SearchTelemetry | null = null
		const ended = await untilEnded((onEnd) => {
			runCpuTurn({
				humanTeam: 0,
				endTurn: onEnd,
				map,
				delayMs: 1,
				policy: 'search',
				search: { budget: { nodes: 300 } },
				onSearch: (t) => (telemetry = t),
			})
		})
		stop()
		expect(ended).toBe(true)
		expect(telemetry).not.toBeNull()
		expect(telemetry!.depthCompleted).toBe(2)
		expect(get(searchTelemetry)).toBe(telemetry)
		// The search's retreat was played (the Scorpion stepped back, no attack), and it
		// went out through the relay funnel like any other CPU action.
		expect(log.some((a) => a.kind === 'attack')).toBe(false)
		const scorpion = map.layers.units.findIndex((u) => u?.team === 1)
		expect(scorpion % COLS).toBeLessThanOrEqual(3)
		expect(log[0].kind).toBe('move')
	})

	it('a greedy turn on the same board takes the bait (the search is the difference)', async () => {
		const map = trap()
		const { log, stop } = relayed()
		const ended = await untilEnded((onEnd) => {
			runCpuTurn({ humanTeam: 0, endTurn: onEnd, map, delayMs: 1 })
		})
		stop()
		expect(ended).toBe(true)
		expect(log.some((a) => a.kind === 'attack')).toBe(true)
	})

	it('a hidden tab searches on a node budget without yielding and ends on microtasks alone', async () => {
		vi.useFakeTimers()
		;(globalThis as { document?: unknown }).document = { hidden: true }
		const map = trap()
		let ended = false
		let telemetry: SearchTelemetry | null = null
		const handle = runCpuTurn({
			humanTeam: 0,
			endTurn: () => {
				ended = true
			},
			map,
			delayMs: 60_000,
			policy: 'search',
			onSearch: (t) => (telemetry = t),
		})
		for (let i = 0; i < 2000; i++) await Promise.resolve()
		handle.cancel()
		vi.useRealTimers()
		expect(ended).toBe(true)
		expect(telemetry).not.toBeNull()
		expect(telemetry!.nodes).toBeLessThanOrEqual(200)
	})

	it('cancel during the search stops it: nothing is committed, the turn is not ended', async () => {
		// A board big enough that a deep, wide search genuinely takes a while.
		const map = makeMap()
		building(map, at(0, 2), B('Warfactory'), 1)
		building(map, at(11, 2), B('Warfactory'), 0)
		building(map, at(1, 0), B('Ground Control'), 1)
		building(map, at(10, 4), B('Ground Control'), 0)
		for (let y = 0; y < ROWS; y++) {
			place(map, at(2, y), y % 2 ? T('Scorpion Tank') : T('Heavy Commando'), 1)
			place(map, at(6, y), y % 2 ? T('Strike Commando') : T('Scorpion Tank'), 0)
		}
		map.funds = 2000
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, currentTeam: 1 }))
		const { log, stop } = relayed()
		let ended = false
		let searched = false
		const handle = runCpuTurn({
			humanTeam: 0,
			endTurn: () => {
				ended = true
			},
			map,
			delayMs: 1,
			policy: 'search',
			search: { maxDepth: 6, B: 16, Bopp: 8, budget: { ms: 8000 } },
			onSearch: () => (searched = true),
		})
		// Let the first tick start the search, then pull the plug while it thinks.
		await new Promise((r) => setTimeout(r, 40))
		handle.cancel()
		await new Promise((r) => setTimeout(r, 300))
		stop()
		expect(ended).toBe(false)
		// The stop callback ended the search early and the cancelled turn discarded it.
		expect(searched).toBe(false)
		expect(log).toEqual([])
		expect(map.layers.units[at(2, 2)]?.team).toBe(1)
	})

	it('an override the board no longer allows is dropped and the turn still completes', async () => {
		const map = trap()
		// A cloaked enemy sits exactly where the search will want to step back to. The
		// believed board doesn't show it, so the plan is made; the live check rejects it.
		const lurker = place(map, at(1, 2), T('Stealth Tank'), 0)
		lurker.hidden = true
		const { log, stop } = relayed()
		const searches: SearchTelemetry[] = []
		const ended = await untilEnded((onEnd) => {
			runCpuTurn({
				humanTeam: 0,
				endTurn: onEnd,
				map,
				delayMs: 1,
				policy: 'search',
				search: { budget: { nodes: 300 } },
				onSearch: (t) => searches.push(t),
			})
		})
		stop()
		expect(ended).toBe(true)
		expect(searches.length).toBeGreaterThanOrEqual(1)
		// Whatever it did instead went through the funnel and the Scorpion still exists.
		expect(log.length).toBeGreaterThan(0)
		expect(map.layers.units.some((u) => u?.team === 1)).toBe(true)
	})
})
