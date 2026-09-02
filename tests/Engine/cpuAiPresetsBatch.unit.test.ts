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

import {
	CPU_PRESETS,
	DEFAULT_CPU_PRESET,
	resolveCpuPreset,
	isCpuPresetName,
} from '../../src/lib/Engine/cpuAi/presets'
import { runBatch } from '../../src/lib/Dev/aiBatch'
import { devScenes } from '../../src/lib/Dev/devScenes'
import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { boardDigest } from '../../src/lib/Engine/boardDigest'
import { currentMatchSeed, setMatchSeed } from '../../src/lib/Engine/matchSeed'
import { weights, DEFAULT_WEIGHTS } from '../../src/lib/Engine/cpuAi/weights'
import { simulationActive } from '../../src/lib/Engine/shadowStore'

describe('CPU presets', () => {
	it('default is the greedy Recruit; the others search', () => {
		expect(DEFAULT_CPU_PRESET).toBe('recruit')
		expect(CPU_PRESETS.recruit.policy).toBe('greedy')
		expect(CPU_PRESETS.veteran.policy).toBe('search')
		expect(CPU_PRESETS.commander.policy).toBe('search')
		expect(CPU_PRESETS.commander.search.maxDepth!).toBeGreaterThan(
			CPU_PRESETS.veteran.search.maxDepth!
		)
	})

	it('resolves request, then override, then default', () => {
		expect(resolveCpuPreset(undefined).name).toBe('recruit')
		expect(resolveCpuPreset(undefined, 'veteran').name).toBe('veteran')
		expect(resolveCpuPreset('commander', 'veteran').name).toBe('commander')
		expect(isCpuPresetName('veteran')).toBe(true)
		expect(isCpuPresetName('impossible')).toBe(false)
	})
})

describe('headless batch', () => {
	it('plays seeded games behind a shadow and leaves the live match, seed and weights alone', async () => {
		const scene = devScenes.find((s) => s.id === 'skirmish')!
		// A live match on the page.
		const live = scene.build()
		initGameStateFromMap(live)
		const liveDigest = boardDigest(live)
		setMatchSeed(777)
		const heard: number[] = []
		const stop = gameState.subscribe((s) => heard.push(s.turnNumber))

		const summary = await runBatch({
			buildMap: scene.build,
			games: 2,
			maxRounds: 6,
			fog: false,
			seedBase: 100,
			alternateSeats: true,
			seats: {
				0: { policy: 'search', search: { maxDepth: 2, budget: { nodes: 60 } } },
				1: { policy: 'greedy', weights: { KILL_BONUS: 40 } },
			},
		})
		stop()

		expect(summary.games.length).toBe(2)
		expect(summary.games[0].seed).toBe(100)
		expect(summary.games[1].seed).toBe(101)
		// Seats swapped on the odd game.
		expect(summary.games[0].seatOf).toEqual({ 0: 0, 1: 1 })
		expect(summary.games[1].seatOf).toEqual({ 0: 1, 1: 0 })
		expect(summary.games[0].searches).toBeGreaterThan(0)
		expect(summary.avgRounds).toBeGreaterThan(1)
		expect(Number.isFinite(summary.avgGap)).toBe(true)

		// The live world is untouched.
		expect(boardDigest(live)).toBe(liveDigest)
		expect(get(gameState).turnNumber).toBe(1)
		expect(heard).toEqual([1])
		expect(currentMatchSeed()).toBe(777)
		expect(weights.KILL_BONUS).toBe(DEFAULT_WEIGHTS.KILL_BONUS)
		expect(simulationActive()).toBe(false)
		setMatchSeed(0)
	})
})
