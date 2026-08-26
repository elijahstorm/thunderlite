// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import {
	SeedStream,
	beginMatchWithSeed,
	currentMatchSeed,
	isSharedSession,
	matchRandom,
	randomMatchSeed,
	resolveMatchSeed,
	seedFromSession,
	setMatchSeed,
} from '../../src/lib/Engine/matchSeed'
import { cpuRandom, setCpuSeed } from '../../src/lib/Engine/cpuAi/rng'

// Every test here installs a seed; restore the 0 default the CPU suite assumes.
afterEach(() => setCpuSeed(0))

describe('resolveMatchSeed', () => {
	it('prefers a stored seed over everything else', () => {
		expect(resolveMatchSeed({ seed: 12345, gameSession: 'room-abc' })).toBe(12345)
		expect(resolveMatchSeed({ seed: 0, gameSession: 'room-abc' })).toBe(0)
	})

	it('falls back to the session id for a room with no stored seed', () => {
		// Deterministic from the id alone, so two clients of the same legacy room
		// derive the same value without either of them storing anything.
		const a = resolveMatchSeed({ seed: null, gameSession: 'room-abc' })
		const b = resolveMatchSeed({ gameSession: 'room-abc' })
		expect(a).toBe(b)
		expect(a).toBe(seedFromSession('room-abc'))
		expect(a).not.toBe(resolveMatchSeed({ gameSession: 'room-xyz' }))
	})

	it('rolls a fresh seed when there is no room to share one', () => {
		// The placeholder sessions are reused verbatim by every offline match, so
		// hashing them would make every playthrough identical — the exact bug this
		// replaces. Each of these must roll instead.
		for (const gameSession of ['', 'ephemeral', 'testSession', null, undefined]) {
			const seeds = new Set(
				Array.from({ length: 8 }, () => resolveMatchSeed({ seed: null, gameSession }))
			)
			expect(seeds.size, `session ${JSON.stringify(gameSession)} repeated a seed`).toBeGreaterThan(
				1
			)
		}
	})

	it('ignores a non-finite stored seed rather than installing NaN', () => {
		expect(resolveMatchSeed({ seed: NaN, gameSession: 'room-abc' })).toBe(
			seedFromSession('room-abc')
		)
	})

	it('normalises a stored seed to 32 bits', () => {
		expect(resolveMatchSeed({ seed: -1 })).toBe(0xffffffff)
	})
})

describe('isSharedSession', () => {
	it('separates real rooms from the offline placeholders', () => {
		expect(isSharedSession('aB3xY')).toBe(true)
		for (const s of ['', 'ephemeral', 'testSession', null, undefined]) {
			expect(isSharedSession(s)).toBe(false)
		}
	})
})

describe('randomMatchSeed', () => {
	it('produces distinct 32-bit values', () => {
		const seeds = new Set(Array.from({ length: 200 }, randomMatchSeed))
		expect(seeds.size).toBeGreaterThan(190)
		for (const s of seeds) {
			expect(Number.isInteger(s)).toBe(true)
			expect(s).toBeGreaterThanOrEqual(0)
			expect(s).toBeLessThanOrEqual(0xffffffff)
		}
	})
})

describe('setMatchSeed / currentMatchSeed', () => {
	it('installs the seed and reports it back', () => {
		expect(setMatchSeed(777)).toBe(777)
		expect(currentMatchSeed()).toBe(777)
	})

	it('drives the CPU stream too, so one seed covers the whole match', () => {
		setMatchSeed(101)
		const cpu = cpuRandom(1, 2, 3)
		setMatchSeed(202)
		expect(cpuRandom(1, 2, 3)).not.toBe(cpu)
		setMatchSeed(101)
		expect(cpuRandom(1, 2, 3)).toBe(cpu)
	})

	it('beginMatchWithSeed resolves and installs in one step', () => {
		expect(beginMatchWithSeed({ seed: 4242 })).toBe(4242)
		expect(currentMatchSeed()).toBe(4242)
	})
})

describe('matchRandom', () => {
	it('is stateless: the same coordinates always give the same draw', () => {
		setMatchSeed(31337)
		const first = matchRandom(SeedStream.ScriptSpawn, 7, 1)
		matchRandom(SeedStream.ScriptSpawn, 99, 99) // an intervening draw must not shift it
		expect(matchRandom(SeedStream.ScriptSpawn, 7, 1)).toBe(first)
	})

	it('gives every stream an independent sequence off one seed', () => {
		setMatchSeed(31337)
		const a = Array.from({ length: 16 }, (_, i) => matchRandom('feature:a', i))
		const b = Array.from({ length: 16 }, (_, i) => matchRandom('feature:b', i))
		expect(b).not.toEqual(a)
		// And neither shadows the CPU's own un-namespaced draws.
		const cpu = Array.from({ length: 16 }, (_, i) => cpuRandom(i))
		expect(a).not.toEqual(cpu)
		expect(b).not.toEqual(cpu)
	})

	it('moves with the seed', () => {
		setMatchSeed(1)
		const one = Array.from({ length: 16 }, (_, i) => matchRandom(SeedStream.ScriptSpawn, i))
		setMatchSeed(2)
		const two = Array.from({ length: 16 }, (_, i) => matchRandom(SeedStream.ScriptSpawn, i))
		expect(two).not.toEqual(one)
	})

	it('stays inside [0, 1)', () => {
		setMatchSeed(9)
		for (let i = 0; i < 500; i++) {
			const r = matchRandom(SeedStream.ScriptSpawn, i)
			expect(r).toBeGreaterThanOrEqual(0)
			expect(r).toBeLessThan(1)
		}
	})
})
