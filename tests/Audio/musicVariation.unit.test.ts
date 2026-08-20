// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	MUSIC_STACK,
	MUSIC_COLOR,
	MUSIC_LAYERS,
	MOOD_SPECS,
	FATIGUE_PHRASES,
	layerTrackId,
	fatigueSteps,
	fatigued,
	variationCycle,
	arrangementFor,
	mixForArrangement,
	mixForMood,
	type MusicMood,
	type MusicArrangement,
} from '../../src/lib/Audio/musicVariation'

const MOODS = Object.keys(MOOD_SPECS) as MusicMood[]

/** Stable identity for an arrangement, ignoring gain. */
const shape = (a: MusicArrangement) => `${a.intensity}|${[...a.color].sort().join(',')}`

describe('layer identity', () => {
	it('maps every layer to a distinct manifest id', () => {
		const ids = MUSIC_LAYERS.map(layerTrackId)
		expect(new Set(ids).size).toBe(MUSIC_LAYERS.length)
		expect(ids).toContain('layers/bed')
	})

	it('keeps the stack and the color layers disjoint', () => {
		const stack = new Set<string>(MUSIC_STACK)
		expect(MUSIC_COLOR.some((c) => stack.has(c))).toBe(false)
	})
})

describe('mixForArrangement', () => {
	it('raises exactly the first `intensity` layers of the stack', () => {
		const mix = mixForArrangement({ intensity: 2, color: [], level: 1 })
		expect(Object.keys(mix).sort()).toEqual(['layers/bed', 'layers/pulse'])
	})

	it('adds color layers on top of the stack prefix', () => {
		const mix = mixForArrangement({ intensity: 1, color: ['accent'], level: 1 })
		expect(Object.keys(mix).sort()).toEqual(['layers/accent', 'layers/bed'])
	})

	it('applies the arrangement level as the gain for every raised layer', () => {
		const mix = mixForArrangement({ intensity: 2, color: ['texture'], level: 0.5 })
		expect(Object.values(mix)).toEqual([0.5, 0.5, 0.5])
	})

	it('returns an empty mix at zero level, so the engine silences everything', () => {
		expect(mixForArrangement({ intensity: 4, color: ['accent'], level: 0 })).toEqual({})
	})

	it('clamps intensity to the stack depth rather than inventing layers', () => {
		const mix = mixForArrangement({ intensity: 99, color: [], level: 1 })
		expect(Object.keys(mix)).toHaveLength(MUSIC_STACK.length)
	})
})

describe('variationCycle', () => {
	it('holds only distinct arrangements', () => {
		for (const mood of MOODS) {
			const cycle = variationCycle(mood, 0, 7)
			const shapes = cycle.map(shape)
			expect(new Set(shapes).size, `mood ${mood}`).toBe(shapes.length)
		}
	})

	it('only ever raises layers the mood declared', () => {
		for (const mood of MOODS) {
			const spec = MOOD_SPECS[mood]
			for (const a of variationCycle(mood, 0, 3)) {
				expect(a.intensity, `mood ${mood}`).toBeGreaterThanOrEqual(spec.minIntensity)
				expect(a.intensity, `mood ${mood}`).toBeLessThanOrEqual(spec.maxIntensity)
				expect(a.color.length, `mood ${mood}`).toBeLessThanOrEqual(spec.colorPick)
				for (const c of a.color) expect(spec.color, `mood ${mood}`).toContain(c)
			}
		}
	})

	it('is never empty, even for a mood pinned to one arrangement', () => {
		for (const mood of MOODS) expect(variationCycle(mood, 0, 1).length).toBeGreaterThan(0)
	})

	it('orders the cycle differently for different seeds', () => {
		// The point of the seed: two matches should not arrange identically.
		const a = variationCycle('player', 0, 1).map(shape).join('>')
		const seeds = [2, 3, 4, 5, 6, 7, 8]
		expect(seeds.some((s) => variationCycle('player', 0, s).map(shape).join('>') !== a)).toBe(true)
	})
})

describe('arrangementFor', () => {
	it('is deterministic — the same inputs always arrange the same way', () => {
		// Replays re-run a match from a seed and must sound like the original.
		for (let v = 0; v < 12; v++) {
			expect(shape(arrangementFor('enemy', v, 0, 42))).toBe(
				shape(arrangementFor('enemy', v, 0, 42))
			)
		}
	})

	it('never repeats an arrangement back to back', () => {
		// This is the whole anti-repetition guarantee: exact repetition is what the
		// ear latches onto, so consecutive variations must differ wherever the mood
		// has more than one arrangement to offer.
		for (const mood of MOODS) {
			const cycleLength = variationCycle(mood, 0, 5).length
			if (cycleLength < 2) continue
			for (let v = 0; v < cycleLength * 3; v++) {
				const here = shape(arrangementFor(mood, v, 0, 5))
				const next = shape(arrangementFor(mood, v + 1, 0, 5))
				expect(next, `mood ${mood} at variation ${v}`).not.toBe(here)
			}
		}
	})

	it('airs every arrangement before any of them comes round again', () => {
		const cycle = variationCycle('player', 0, 9)
		const seen = new Set<string>()
		for (let v = 0; v < cycle.length; v++) seen.add(shape(arrangementFor('player', v, 0, 9)))
		expect(seen.size).toBe(cycle.length)
	})

	it('handles a negative variation index without throwing', () => {
		expect(() => arrangementFor('player', -3, 0, 1)).not.toThrow()
	})
})

describe('fatigue', () => {
	it('counts one step per FATIGUE_PHRASES phrases in a mood', () => {
		expect(fatigueSteps(0)).toBe(0)
		expect(fatigueSteps(FATIGUE_PHRASES - 1)).toBe(0)
		expect(fatigueSteps(FATIGUE_PHRASES)).toBe(1)
		expect(fatigueSteps(FATIGUE_PHRASES * 3)).toBe(3)
	})

	it('leaves a fresh mood untouched', () => {
		expect(fatigued('player', 0)).toEqual(MOOD_SPECS.player)
	})

	it('thins the arrangement out the longer one mood overstays', () => {
		const fresh = fatigued('player', 0)
		const tired = fatigued('player', FATIGUE_PHRASES)
		expect(tired.maxIntensity).toBeLessThan(fresh.maxIntensity)
		expect(tired.colorPick).toBeLessThan(fresh.colorPick)
		expect(tired.level).toBeLessThan(fresh.level)
	})

	it('decays toward the mood floor instead of toward silence', () => {
		const spec = MOOD_SPECS.enemy
		const exhausted = fatigued('enemy', FATIGUE_PHRASES * 50)
		expect(exhausted.maxIntensity).toBe(spec.minIntensity)
		expect(exhausted.colorPick).toBe(0)
		expect(exhausted.level).toBeGreaterThan(0)
	})

	it('exempts the moods whose whole job is grabbing attention', () => {
		// A hurry warning that faded out would be worse than useless.
		expect(fatigued('hurry', FATIGUE_PHRASES * 10)).toEqual(MOOD_SPECS.hurry)
		expect(fatigued('silent', FATIGUE_PHRASES * 10)).toEqual(MOOD_SPECS.silent)
	})

	it('makes a long grind quieter and thinner than its own opening', () => {
		const opening = mixForMood('enemy', 0, 0, 11)
		const grind = mixForMood('enemy', 0, FATIGUE_PHRASES * 4, 11)
		expect(Object.keys(grind).length).toBeLessThanOrEqual(Object.keys(opening).length)
		expect(Math.max(...Object.values(grind))).toBeLessThan(Math.max(...Object.values(opening)))
	})
})

describe('mood shapes', () => {
	it('silences the bed entirely for `silent`', () => {
		expect(mixForMood('silent', 0, 0, 0)).toEqual({})
	})

	it('keeps `rest` present but well back', () => {
		const mix = mixForMood('rest', 0, 0, 0)
		expect(Object.keys(mix)).toEqual(['layers/bed'])
		expect(Object.values(mix)[0]).toBeLessThan(1)
	})

	it('gives the local turn a fuller bed than a CPU lull', () => {
		// The reward for the grind ending has to be audible.
		const player = mixForMood('player', 0, 0, 0)
		const thinking = mixForMood('thinking', 0, 0, 0)
		expect(Object.keys(player).length).toBeGreaterThan(Object.keys(thinking).length)
		expect(Math.max(...Object.values(player))).toBeGreaterThan(Math.max(...Object.values(thinking)))
	})

	it('opens `hurry` all the way up', () => {
		const mix = mixForMood('hurry', 0, 0, 0)
		for (const layer of MUSIC_STACK) expect(mix[layerTrackId(layer)]).toBe(1)
	})
})
