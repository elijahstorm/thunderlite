// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('../../src/lib/Engine/Animator/animator', () => ({
	animateRoute: () => Promise.resolve(),
	animateHealthBar: () => Promise.resolve(),
	animateExplosion: () => Promise.resolve(),
	panBoardToBuiltUnit: () => false,
}))
vi.mock('../../src/lib/Audio/audioEngine', () => ({ audioEngine: { playSfx: () => {} } }))

import { setCpuSeed, cpuRandom, sampleByScore } from '../../src/lib/Engine/cpuAi/rng'
import { pickBuildOnce } from '../../src/lib/Engine/cpuAi/production'
import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

/**
 * The CPU used to be strict argmax everywhere, so the same board always produced the
 * same move and two CPUs on a mirrored map opened identically. These pin the two
 * properties that make the replacement safe: it never reaches past the band of options
 * it rates as comparable, and with no salt set it stays perfectly reproducible so the
 * rest of the CPU suite and the sim harness are unaffected.
 */

const T = (name: string) => unitData.findIndex((u) => u.name === name)
const B = (name: string) => buildingData.findIndex((b) => b.name === name)
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const N = 64

afterEach(() => setCpuSeed(0))

describe('sampleByScore', () => {
	const items = [{ score: 100 }, { score: 96 }, { score: 92 }, { score: 40 }, { score: 5 }]

	it('never reaches past the temperature band', () => {
		// The whole safety argument: a clearly worse option is unreachable, however the
		// dice land. Sweep enough salts to make a leak overwhelmingly likely if it existed.
		for (let seed = 0; seed < 400; seed++) {
			setCpuSeed(seed)
			const picked = sampleByScore(items, 10, seed)
			expect(picked!.score).toBeGreaterThanOrEqual(90)
		}
	})

	it('collapses to plain argmax at zero temperature', () => {
		for (let seed = 0; seed < 50; seed++) {
			setCpuSeed(seed)
			expect(sampleByScore(items, 0, seed)!.score).toBe(100)
		}
	})

	it('actually varies across salts, and favours the better options', () => {
		const seen = new Map<number, number>()
		for (let seed = 0; seed < 400; seed++) {
			setCpuSeed(seed)
			const picked = sampleByScore(items, 10, 1, 2, 3)!.score
			seen.set(picked, (seen.get(picked) ?? 0) + 1)
		}
		// More than one outcome, or it is still a lookup table.
		expect(seen.size).toBeGreaterThan(1)
		// Softmax, not uniform: the best option is still the most likely.
		expect(seen.get(100)!).toBeGreaterThan(seen.get(92) ?? 0)
	})

	it('is reproducible for the same salt and key', () => {
		setCpuSeed('a-session-id')
		const first = sampleByScore(items, 10, 7, 7)
		const second = sampleByScore(items, 10, 7, 7)
		expect(second).toBe(first)
	})

	it('gives different streams for different keys under one salt', () => {
		setCpuSeed('a-session-id')
		const draws = new Set<number>()
		for (let key = 0; key < 60; key++) draws.add(cpuRandom(key))
		expect(draws.size).toBeGreaterThan(50)
	})

	it('handles an empty candidate list', () => {
		expect(sampleByScore([], 10, 1)).toBeNull()
	})
})

describe('production variation', () => {
	const board = () => {
		const map = {
			cols: 8,
			rows: 8,
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
		map.layers.buildings[0] = { type: B('Ground Control'), state: 0, team: 0 } as BuildingObject
		map.layers.buildings[1] = { type: B('Warfactory'), state: 0, team: 0 } as BuildingObject
		for (const tile of [40, 41, 42]) {
			map.layers.units[tile] = {
				type: T('Annihilator Tank'),
				state: 0,
				team: 1,
				health: 140,
			} as UnitObject
		}
		// Two capture units already fielded: below that, `scoreBuildChoice` adds a flat
		// +200 for capture-capable types, which dwarfs the temperature band and would
		// leave exactly one candidate in the pool — a real behaviour, just not the one
		// under test here.
		for (const tile of [8, 9]) {
			map.layers.units[tile] = {
				type: T('Heavy Commando'),
				state: 0,
				team: 0,
				health: 40,
			} as UnitObject
		}
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, players: s.players.map((p) => ({ ...p, money: 1200 })) }))
		return map
	}

	it('does not buy the identical unit every game', () => {
		const picks = new Set<number>()
		for (let seed = 1; seed <= 40; seed++) {
			setCpuSeed(seed)
			const build = pickBuildOnce(board(), 0)
			if (build && build.kind === 'build') picks.add(build.unitType)
		}
		expect(picks.size).toBeGreaterThan(1)
	})

	it('stays deterministic when no salt is set', () => {
		setCpuSeed(0)
		const first = pickBuildOnce(board(), 0)
		const second = pickBuildOnce(board(), 0)
		expect(second).toEqual(first)
	})
})
