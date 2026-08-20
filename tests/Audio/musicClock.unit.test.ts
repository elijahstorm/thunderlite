// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { MusicClock, type TimerHandle } from '../../src/lib/Audio/musicClock'

/** A clock whose position we drive by hand, collecting the phrases it emits. */
function harness(phraseSeconds = 8) {
	let position: number | null = 0
	const fired: number[] = []
	let tick: (() => void) | null = null
	let cleared = 0

	const clock = new MusicClock({
		phraseSeconds,
		position: () => position,
		onPhrase: (p) => fired.push(p),
		setTimer: (fn) => {
			tick = fn
			return 1 as unknown as TimerHandle
		},
		clearTimer: () => {
			cleared++
			tick = null
		},
	})

	return {
		clock,
		fired,
		clearedCount: () => cleared,
		hasTimer: () => tick !== null,
		/** Move the bed to `seconds` and let the clock sample it. */
		seek(seconds: number | null) {
			position = seconds
			clock.sample()
		},
		/** Fire the registered interval callback. */
		poll() {
			tick?.()
		},
	}
}

describe('MusicClock', () => {
	it('adopts the opening position without emitting a phrase', () => {
		// The consumer already has an arrangement for phrase 0; firing here would
		// make it re-arrange the instant the music starts.
		const h = harness()
		h.seek(0)
		expect(h.fired).toEqual([])
	})

	it('stays quiet while inside the same phrase', () => {
		const h = harness(8)
		h.seek(0)
		h.seek(3)
		h.seek(7.9)
		expect(h.fired).toEqual([])
	})

	it('emits on each phrase edge it crosses', () => {
		const h = harness(8)
		h.seek(0)
		h.seek(8)
		h.seek(16)
		h.seek(24)
		expect(h.fired).toEqual([1, 2, 3])
	})

	it('credits every phrase skipped by a slow sample', () => {
		// A backgrounded tab must not under-count, or fatigue would stall.
		const h = harness(8)
		h.seek(0)
		h.seek(40)
		expect(h.fired).toEqual([5])
		expect(h.clock.current()).toBe(5)
	})

	it('keeps counting across a loop wrap instead of resetting', () => {
		// This is the reason the count is monotonic: a counter that reset every
		// wrap would hand the director the same variation index on every pass,
		// which is exactly the repetition the bed exists to avoid.
		const h = harness(8)
		h.seek(0)
		h.seek(8)
		h.seek(16)
		h.seek(0) // loop wrapped back to the top
		expect(h.fired).toEqual([1, 2, 3])
		expect(h.clock.current()).toBe(3)
	})

	it('treats a wrap as exactly one phrase edge, however far back it jumps', () => {
		const h = harness(8)
		h.seek(88)
		h.seek(0)
		expect(h.fired).toEqual([1])
	})

	it('re-baselines when the bed stops, without emitting', () => {
		const h = harness(8)
		h.seek(0)
		h.seek(16)
		expect(h.fired).toEqual([2])

		h.seek(null) // bed paused / muted
		h.seek(40) // resumed somewhere else entirely
		expect(h.fired).toEqual([2]) // the resume itself is not a phrase edge

		h.seek(48)
		expect(h.fired).toEqual([2, 3])
	})

	it('ignores a nonsense position', () => {
		const h = harness(8)
		h.seek(0)
		h.seek(Number.NaN)
		h.seek(-5)
		expect(h.fired).toEqual([])
	})

	it('samples on its interval once started', () => {
		const h = harness(8)
		h.clock.start()
		h.poll()
		expect(h.hasTimer()).toBe(true)
	})

	it('does not stack timers when started twice', () => {
		const h = harness()
		h.clock.start()
		h.clock.start()
		h.clock.stop()
		expect(h.clearedCount()).toBe(1)
		expect(h.hasTimer()).toBe(false)
	})

	it('keeps its phrase count across a stop/start, and drops it on reset', () => {
		const h = harness(8)
		h.seek(0)
		h.seek(24)
		expect(h.clock.current()).toBe(3)

		h.clock.stop()
		h.clock.start()
		expect(h.clock.current()).toBe(3)

		h.clock.reset()
		expect(h.clock.current()).toBe(0)
	})
})
