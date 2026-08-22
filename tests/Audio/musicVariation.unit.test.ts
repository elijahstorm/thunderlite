// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	MOOD_SPECS,
	FATIGUE_PHRASES,
	fatigueSteps,
	extrasBudget,
	variationCycle,
	arrangementFor,
	mixForArrangement,
	mixForMood,
	seedFromString,
	type MusicMood,
	type MusicArrangement,
} from '../../src/lib/Audio/musicVariation'
import type { MusicPack } from '../../src/lib/Audio/musicPacks'

const MOODS = Object.keys(MOOD_SPECS) as MusicMood[]

/** A pack with `extras` freely combinable layers on top of a foundation. */
const testPack = (extras = 2): MusicPack => ({
	id: 'test',
	loopSeconds: 60,
	phrasesPerLoop: 4,
	foundation: 'packs/test/layer1',
	extras: Array.from({ length: extras }, (_, i) => `packs/test/layer${i + 2}`),
})

/** Stable identity for an arrangement, ignoring gain. */
const shape = (a: MusicArrangement) => `${a.foundation ? 'F' : '-'}|${[...a.extras].join(',')}`

describe('extrasBudget', () => {
	it('scales a mood to the pool it is given', () => {
		// The same mood table has to serve a 3-layer pack and a 6-layer one, so the
		// specs are fractions of the pool rather than absolute counts.
		expect(extrasBudget('player', 0, 2)).toMatchObject({ min: 1, max: 2 })
		expect(extrasBudget('player', 0, 4)).toMatchObject({ min: 2, max: 4 })
	})

	it('never asks for more extras than the pool holds', () => {
		for (const mood of MOODS) {
			for (const pool of [0, 1, 2, 3, 5]) {
				const b = extrasBudget(mood, 0, pool)
				expect(b.max, `${mood} @ pool ${pool}`).toBeLessThanOrEqual(pool)
				expect(b.min, `${mood} @ pool ${pool}`).toBeLessThanOrEqual(b.max)
				expect(b.min).toBeGreaterThanOrEqual(0)
			}
		}
	})

	it('keeps the foundation up in every mood but `silent`', () => {
		for (const mood of MOODS) {
			expect(extrasBudget(mood, 0, 2).foundation, mood).toBe(mood !== 'silent')
		}
	})

	it('counts one fatigue step per FATIGUE_PHRASES phrases', () => {
		expect(fatigueSteps(0)).toBe(0)
		expect(fatigueSteps(FATIGUE_PHRASES - 1)).toBe(0)
		expect(fatigueSteps(FATIGUE_PHRASES)).toBe(1)
		expect(fatigueSteps(FATIGUE_PHRASES * 3)).toBe(3)
	})

	it('thins a mood out the longer it overstays', () => {
		const fresh = extrasBudget('player', 0, 2)
		const tired = extrasBudget('player', FATIGUE_PHRASES, 2)
		expect(tired.max).toBeLessThan(fresh.max)
		expect(tired.level).toBeLessThan(fresh.level)
	})

	it('decays toward the mood floor, never into silence', () => {
		const exhausted = extrasBudget('enemy', FATIGUE_PHRASES * 50, 2)
		expect(exhausted.max).toBe(exhausted.min)
		expect(exhausted.min).toBe(extrasBudget('enemy', 0, 2).min)
		expect(exhausted.level).toBeGreaterThan(0)
	})

	it('exempts the moods whose whole job is grabbing attention', () => {
		// A hurry warning that faded out would be worse than useless.
		expect(extrasBudget('hurry', FATIGUE_PHRASES * 10, 2)).toEqual(extrasBudget('hurry', 0, 2))
		expect(extrasBudget('silent', FATIGUE_PHRASES * 10, 2)).toEqual(extrasBudget('silent', 0, 2))
	})
})

describe('mixForArrangement', () => {
	const pack = testPack(2)

	it('raises the foundation and the named extras', () => {
		const mix = mixForArrangement({ foundation: true, extras: [1], level: 1 }, pack)
		expect(Object.keys(mix).sort()).toEqual(['packs/test/layer1', 'packs/test/layer3'])
	})

	it('applies the level as the gain for every raised layer', () => {
		const mix = mixForArrangement({ foundation: true, extras: [0, 1], level: 0.5 }, pack)
		expect(Object.values(mix)).toEqual([0.5, 0.5, 0.5])
	})

	it('returns an empty mix at zero level, so the engine silences everything', () => {
		expect(mixForArrangement({ foundation: true, extras: [0], level: 0 }, pack)).toEqual({})
	})

	it('drops an extra index the pack does not have rather than inventing a layer', () => {
		const mix = mixForArrangement({ foundation: true, extras: [0, 9], level: 1 }, pack)
		expect(Object.keys(mix).sort()).toEqual(['packs/test/layer1', 'packs/test/layer2'])
	})

	it('can omit the foundation entirely', () => {
		const mix = mixForArrangement({ foundation: false, extras: [0], level: 1 }, pack)
		expect(Object.keys(mix)).toEqual(['packs/test/layer2'])
	})
})

describe('variationCycle', () => {
	it('holds only distinct arrangements', () => {
		for (const mood of MOODS) {
			for (const pool of [2, 4]) {
				const shapes = variationCycle(mood, 0, 7, pool).map(shape)
				expect(new Set(shapes).size, `${mood} @ pool ${pool}`).toBe(shapes.length)
			}
		}
	})

	it('stays inside the mood budget', () => {
		for (const mood of MOODS) {
			const budget = extrasBudget(mood, 0, 3)
			for (const a of variationCycle(mood, 0, 3, 3)) {
				expect(a.extras.length, mood).toBeGreaterThanOrEqual(budget.min)
				expect(a.extras.length, mood).toBeLessThanOrEqual(budget.max)
				expect(a.foundation, mood).toBe(budget.foundation)
				for (const i of a.extras) expect(i).toBeLessThan(3)
			}
		}
	})

	it('is never empty, even for a mood pinned to one arrangement', () => {
		for (const mood of MOODS) {
			expect(variationCycle(mood, 0, 1, 2).length, mood).toBeGreaterThan(0)
			expect(variationCycle(mood, 0, 1, 0).length, mood).toBeGreaterThan(0)
		}
	})

	it('widens as the pack gets bigger, so a larger pack pays off for free', () => {
		const small = variationCycle('player', 0, 1, 2).length
		const large = variationCycle('player', 0, 1, 5).length
		expect(large).toBeGreaterThan(small)
	})

	it('orders the cycle differently for different seeds', () => {
		const a = variationCycle('player', 0, 1, 3).map(shape).join('>')
		const seeds = [2, 3, 4, 5, 6, 7, 8]
		expect(seeds.some((s) => variationCycle('player', 0, s, 3).map(shape).join('>') !== a)).toBe(
			true
		)
	})
})

describe('arrangementFor', () => {
	it('is deterministic — the same inputs always arrange the same way', () => {
		// Replays re-run a match from a seed and must sound like the original.
		for (let v = 0; v < 12; v++) {
			expect(shape(arrangementFor('enemy', v, 0, 42, 2))).toBe(
				shape(arrangementFor('enemy', v, 0, 42, 2))
			)
		}
	})

	it('never repeats an arrangement back to back', () => {
		// The core anti-repetition guarantee: exact repetition is what the ear
		// latches onto, so consecutive variations must differ wherever the mood has
		// more than one arrangement to offer.
		for (const mood of MOODS) {
			for (const pool of [2, 3, 5]) {
				const length = variationCycle(mood, 0, 5, pool).length
				if (length < 2) continue
				for (let v = 0; v < length * 3; v++) {
					const here = shape(arrangementFor(mood, v, 0, 5, pool))
					const next = shape(arrangementFor(mood, v + 1, 0, 5, pool))
					expect(next, `${mood} @ pool ${pool}, variation ${v}`).not.toBe(here)
				}
			}
		}
	})

	it('airs every arrangement before any of them comes round again', () => {
		const cycle = variationCycle('player', 0, 9, 3)
		const seen = new Set<string>()
		for (let v = 0; v < cycle.length; v++) seen.add(shape(arrangementFor('player', v, 0, 9, 3)))
		expect(seen.size).toBe(cycle.length)
	})

	it('handles a negative variation index without throwing', () => {
		expect(() => arrangementFor('player', -3, 0, 1, 2)).not.toThrow()
	})
})

describe('mood shapes', () => {
	const pack = testPack(2)

	it('silences the bed entirely for `silent`', () => {
		expect(mixForMood('silent', 0, 0, 0, pack)).toEqual({})
	})

	it('keeps `rest` to the foundation alone, well back', () => {
		const mix = mixForMood('rest', 0, 0, 0, pack)
		expect(Object.keys(mix)).toEqual([pack.foundation])
		expect(Object.values(mix)[0]).toBeLessThan(1)
	})

	it('gives the local turn a fuller bed than a CPU lull', () => {
		// The reward for the grind ending has to be audible.
		const player = mixForMood('player', 0, 0, 0, pack)
		const thinking = mixForMood('thinking', 0, 0, 0, pack)
		expect(Object.keys(player).length).toBeGreaterThanOrEqual(Object.keys(thinking).length)
		expect(Math.max(...Object.values(player))).toBeGreaterThan(Math.max(...Object.values(thinking)))
	})

	it('opens `hurry` all the way up', () => {
		const mix = mixForMood('hurry', 0, 0, 0, pack)
		expect(Object.keys(mix).sort()).toEqual([pack.foundation, ...pack.extras].sort())
		expect(Object.values(mix).every((g) => g === 1)).toBe(true)
	})

	it('makes a long grind quieter and thinner than its own opening', () => {
		const opening = mixForMood('enemy', 0, 0, 11, pack)
		const grind = mixForMood('enemy', 0, FATIGUE_PHRASES * 4, 11, pack)
		expect(Object.keys(grind).length).toBeLessThanOrEqual(Object.keys(opening).length)
		expect(Math.max(...Object.values(grind))).toBeLessThan(Math.max(...Object.values(opening)))
	})
})

describe('seedFromString', () => {
	it('is stable and case sensitive', () => {
		expect(seedFromString('match-a')).toBe(seedFromString('match-a'))
		expect(seedFromString('match-a')).not.toBe(seedFromString('match-b'))
	})

	it('returns a non-negative integer for the empty string', () => {
		expect(Number.isInteger(seedFromString(''))).toBe(true)
		expect(seedFromString('')).toBeGreaterThanOrEqual(0)
	})
})
