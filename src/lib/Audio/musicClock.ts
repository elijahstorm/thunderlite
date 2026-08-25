/**
 * Phrase clock for the adaptive music bed.
 *
 * Variation has to land on a musical boundary. Changing which layers are up
 * halfway through a bar sounds like a mistake even when the layers themselves
 * are in time, so the director waits for a phrase edge before re-arranging.
 *
 * The clock derives phrase edges from the bed's own playback position rather
 * than from wall-clock time. A `setInterval` would drift against the audio
 * device within a couple of minutes and put every subsequent change slightly
 * off the beat; sampling `currentTime` cannot drift, because it *is* the
 * timeline we want to be aligned to. Sampling is deliberately coarse (four
 * times a second by default) — the consumer only uses the edge to start an
 * 800ms-plus crossfade, so being a fraction of a beat late is inaudible, and
 * polling gain is far cheaper than the Web Audio rewrite that sample-accurate
 * scheduling would need.
 *
 * The emitted count is monotonic and deliberately does *not* reset when the
 * loop wraps. A counter that reset every wrap would hand the director the same
 * variation index on every pass through the loop, which is exactly the
 * repetition this whole subsystem exists to remove.
 */

export type TimerHandle = ReturnType<typeof setInterval>

export interface MusicClockOptions {
	/**
	 * Seconds of audio per phrase. One loop should be a whole number of these.
	 *
	 * Pass a function to resolve it per sample. The pack registry only knows a
	 * rounded loop length, and the encoded assets are a few tens of milliseconds
	 * shorter than that (worse on mp3 than ogg), so a fixed phrase length walks
	 * off the loop point over a long match — which is exactly the misalignment
	 * `phrasesPerLoop` exists to prevent. A resolver reading the bed's decoded
	 * loop length keeps every edge on the grid. Non-finite or non-positive
	 * results fall back to the last usable value.
	 */
	phraseSeconds: number | (() => number)
	/** Bed playback position in seconds, or `null` when nothing is running. */
	position: () => number | null
	/** Fired on each phrase edge with the monotonic phrase count (starts at 1). */
	onPhrase: (phrase: number) => void
	/** Position sampling interval in ms. */
	pollMs?: number
	/** Injectable interval timer (testing). */
	setTimer?: (fn: () => void, ms: number) => TimerHandle
	/** Injectable interval clear (testing). */
	clearTimer?: (handle: TimerHandle) => void
}

const DEFAULT_POLL_MS = 250

export class MusicClock {
	private readonly resolvePhraseSeconds: () => number
	/** Last usable phrase length, held so a bad resolve cannot break the grid. */
	private phraseSeconds: number
	private readonly position: () => number | null
	private readonly onPhrase: (phrase: number) => void
	private readonly pollMs: number
	private readonly setTimer: (fn: () => void, ms: number) => TimerHandle
	private readonly clearTimer: (handle: TimerHandle) => void

	private timer: TimerHandle | null = null
	/** Phrase slot last observed within the current loop pass, `null` until seen. */
	private lastSlot: number | null = null
	/** Monotonic phrase count across loop wraps. */
	private phrase = 0

	constructor(opts: MusicClockOptions) {
		const spec = opts.phraseSeconds
		this.resolvePhraseSeconds = typeof spec === 'function' ? spec : () => spec
		this.phraseSeconds = Math.max(0.001, typeof spec === 'function' ? spec() : spec)
		this.position = opts.position
		this.onPhrase = opts.onPhrase
		this.pollMs = Math.max(1, opts.pollMs ?? DEFAULT_POLL_MS)
		this.setTimer = opts.setTimer ?? ((fn, ms) => setInterval(fn, ms))
		this.clearTimer = opts.clearTimer ?? ((h) => clearInterval(h))
	}

	/** Begin sampling. Idempotent. */
	start(): void {
		if (this.timer !== null) return
		this.timer = this.setTimer(() => this.sample(), this.pollMs)
	}

	/** Stop sampling. Keeps the phrase count so a restart continues from it. */
	stop(): void {
		if (this.timer === null) return
		this.clearTimer(this.timer)
		this.timer = null
	}

	/** Drop all position/phrase history — for a fresh match. */
	reset(): void {
		this.lastSlot = null
		this.phrase = 0
	}

	/** Current monotonic phrase count. */
	current(): number {
		return this.phrase
	}

	/**
	 * Sample the bed position and emit a phrase edge if we crossed one. Exposed
	 * for tests so they can step the clock without a timer.
	 */
	/** Phrase length for this sample, ignoring a resolver that returns garbage. */
	private phraseLength(): number {
		const resolved = this.resolvePhraseSeconds()
		if (Number.isFinite(resolved) && resolved > 0) this.phraseSeconds = resolved
		return this.phraseSeconds
	}

	sample(): void {
		const pos = this.position()
		if (pos === null || !Number.isFinite(pos) || pos < 0) {
			// Bed not running. Re-baseline so a restart does not read as a huge jump.
			this.lastSlot = null
			return
		}

		const slot = Math.floor(pos / this.phraseLength())
		if (this.lastSlot === null) {
			// First sighting: adopt the position silently. The consumer already has
			// an arrangement for phrase 0; firing here would re-arrange immediately.
			this.lastSlot = slot
			return
		}
		if (slot === this.lastSlot) return

		// Forward within the same pass: credit every phrase we skipped, so a
		// stalled tab does not under-count. Backwards means the loop wrapped
		// (position jumped to ~0), which is exactly one phrase edge.
		const advanced = slot > this.lastSlot ? slot - this.lastSlot : 1
		this.lastSlot = slot
		this.phrase += advanced
		this.onPhrase(this.phrase)
	}
}
