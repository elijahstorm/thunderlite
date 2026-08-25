/**
 * Web Audio stem bed — the phase-locked half of the music engine.
 *
 * The adaptive bed plays several layers of one composition at once and mixes
 * them by gain alone. That only works if the layers stay sample-aligned for the
 * whole match, and `HTMLAudioElement` cannot do that. Two reasons, both fatal:
 *
 *  1. `play()` starts each element whenever *that element* has buffered enough.
 *     Three parallel fetches finish at three different moments, so the layers
 *     begin tens of milliseconds to whole seconds apart and stay that way.
 *  2. `loop = true` is specified as "seek back to the start on reaching the
 *     end". It is not sample-accurate, and each element wraps on its own, so
 *     every loop point adds a fresh few milliseconds of relative offset in a
 *     random direction. A perfect start still smears within a few minutes.
 *
 * `AudioBufferSourceNode` has neither problem. Every source is scheduled
 * against the same `AudioContext` clock, so `start(t)` on the same `t` means
 * the same sample, and its looping is sample-exact rather than a seek. Once
 * scheduled, drift is not merely small — it is unrepresentable.
 *
 * The cost is that a buffer source needs the whole layer decoded in memory
 * (~23MB per minute of 48kHz stereo), so buffers are cached for the *current*
 * pack only and dropped when the bed switches to another one. A match plays one
 * pack, which is what keeps that bounded.
 *
 * Gains ramp on `AudioParam` automation rather than a `requestAnimationFrame`
 * tween. Automation runs on the audio thread, so a crossfade completes at the
 * right rate even while the tab is hidden — where rAF stops firing and used to
 * freeze a fade part-way.
 *
 * Every Web Audio type is narrowed to the handful of members used here so the
 * bed can be driven by a plain fake under vitest, with no jsdom audio support.
 */

/** One layer to load: its manifest name and the resolved file URL. */
export interface StemSource {
	name: string
	url: string
}

export interface AudioParamLike {
	value: number
	cancelScheduledValues(when: number): void
	setValueAtTime(value: number, when: number): void
	linearRampToValueAtTime(value: number, when: number): void
}

export interface GainNodeLike {
	readonly gain: AudioParamLike
	connect(destination: unknown): void
	disconnect(): void
}

export interface AudioBufferLike {
	readonly duration: number
}

export interface BufferSourceLike {
	buffer: AudioBufferLike | null
	loop: boolean
	loopStart: number
	loopEnd: number
	connect(destination: unknown): void
	disconnect(): void
	start(when?: number): void
	stop(when?: number): void
}

/** The slice of `AudioContext` the bed drives. */
export interface BedContextLike {
	readonly currentTime: number
	readonly state: string
	readonly destination: unknown
	createGain(): GainNodeLike
	createBufferSource(): BufferSourceLike
	decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>
	resume(): Promise<void>
}

/** Diagnostics for the audio dev board. */
export interface MusicBedStatus {
	/** Context state, or `'none'` before the first bed is started. */
	contextState: string
	/** Layers currently loaded (decoded or in flight). */
	stems: number
	/** Every layer decoded and attached. */
	ready: boolean
	/** Sources scheduled on the context clock — the bed is locked and running. */
	scheduled: boolean
	/** Loop length actually in use, in seconds. */
	loopSeconds: number | null
	/** Bed position in seconds, or `null` when not running. */
	position: number | null
	/** Decoded buffers held in memory. */
	buffered: number
}

/** What the audio engine needs from a stem bed. */
export interface MusicBed {
	/** Load the given layers and start them all on one instant. */
	start(stems: readonly StemSource[]): void
	/** Move every layer toward its target gain over `fadeMs`. */
	setGains(gains: ReadonlyMap<string, number>, fadeMs: number): void
	/** Master gain for the whole bed (music channel volume × mute). */
	setOutputGain(gain: number): void
	/**
	 * Sound-off gate. While suppressed the bed decodes but never schedules, so
	 * no audio session is claimed. Muting a bed that is already running leaves it
	 * running (silent), matching how the element path behaved.
	 */
	setSuppressed(suppressed: boolean): void
	/** Current rendered gain per layer. */
	gains(): ReadonlyMap<string, number>
	/** Bed position in seconds, or `null` when it is not running. */
	position(): number | null
	/** Loop length of the running bed in seconds, or `null`. */
	loopSeconds(): number | null
	/**
	 * Stop and release every source. Decoded buffers survive, so restarting the
	 * same pack (rematch, replay, the dev board) is instant; starting a different
	 * one evicts them.
	 */
	stop(): void
	status(): MusicBedStatus
}

/**
 * Scheduling lead-in. `start(t)` needs `t` to still be in the future when the
 * audio thread picks it up, or the source starts late by however much it
 * missed — which would reintroduce exactly the offset this module exists to
 * remove. 120ms is comfortably past a render quantum on a loaded main thread
 * and short enough that nobody hears the bed arrive late.
 */
export const BED_LEAD_IN_SECONDS = 0.12

/**
 * Ramp applied to master gain changes. An instant `AudioParam` set is a
 * discontinuity in the signal and clicks audibly; 15ms is inaudible as a fade
 * and removes the click.
 */
const OUTPUT_RAMP_SECONDS = 0.015

interface Stem extends StemSource {
	gain: GainNodeLike
	source: BufferSourceLike | null
	buffer: AudioBufferLike | null
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.min(1, Math.max(0, value))
}

export interface WebAudioMusicBedOptions {
	/** Built lazily, on the first `start()` — never at module import. */
	createContext: () => BedContextLike
	/** Fetch a layer's encoded bytes. Defaults to `fetch`. */
	fetchBytes?: (url: string) => Promise<ArrayBuffer>
	/** Called when a layer cannot be loaded, so callers can log it. */
	onError?: (url: string, error: unknown) => void
}

export class WebAudioMusicBed implements MusicBed {
	private readonly createContext: () => BedContextLike
	private readonly fetchBytes: (url: string) => Promise<ArrayBuffer>
	private readonly onError: (url: string, error: unknown) => void

	private ctx: BedContextLike | null = null
	/** Master node every stem gain feeds into. Created with the context. */
	private output: GainNodeLike | null = null
	private outputGain = 0

	private stems: Stem[] = []
	private buffers = new Map<string, AudioBufferLike>()
	/**
	 * Bumped on every `start()`/`stop()`. An in-flight decode compares it before
	 * touching the graph, so a bed torn down mid-load cannot resurrect itself.
	 */
	private generation = 0
	private ready = false
	private scheduled = false
	private suppressed = false
	/** Context time the sources were scheduled for. */
	private startedAt = 0
	private loopLength: number | null = null

	constructor(opts: WebAudioMusicBedOptions) {
		this.createContext = opts.createContext
		this.fetchBytes = opts.fetchBytes ?? ((url) => fetch(url).then((r) => r.arrayBuffer()))
		this.onError = opts.onError ?? (() => {})
	}

	/** Context state for diagnostics, `'none'` before the first bed. */
	contextState(): string {
		return this.ctx?.state ?? 'none'
	}

	/**
	 * Resume a suspended context. Browsers hold a freshly built context in
	 * `suspended` until a user gesture, so the page wires this to the first
	 * pointer/key event as well as calling it when scheduling.
	 */
	async resume(): Promise<void> {
		if (!this.ctx) return
		try {
			await this.ctx.resume()
		} catch {
			// Still gesture-gated; the next gesture will try again.
		}
	}

	start(stems: readonly StemSource[]): void {
		this.stop()
		if (stems.length === 0) return

		const ctx = this.context()
		const generation = ++this.generation

		// Gain nodes exist before the audio does, so a `setGains` arriving during
		// the decode window lands on the right node instead of being dropped.
		this.stems = stems.map((s) => {
			const gain = ctx.createGain()
			gain.gain.value = 0
			gain.connect(this.output)
			return { ...s, gain, source: null, buffer: null }
		})

		// Only this pack's layers stay decoded — everything else is ~23MB a minute
		// of resident memory for audio nobody will hear again this match. Pruning
		// here rather than in `stop()` is what makes a restart of the same pack
		// instant while still capping the cache at one pack's worth.
		const keep = new Set(stems.map((s) => s.url))
		for (const url of [...this.buffers.keys()]) {
			if (!keep.has(url)) this.buffers.delete(url)
		}

		void this.load(generation)
	}

	private async load(generation: number): Promise<void> {
		const urls = this.stems.map((s) => s.url)
		const decoded = await Promise.all(urls.map((url) => this.buffer(url)))
		if (generation !== this.generation) return // stopped or restarted mid-load
		if (decoded.some((b) => b === null)) return // a layer is missing; do not run a partial bed

		this.stems.forEach((stem, i) => {
			stem.buffer = decoded[i]
		})
		this.ready = true
		if (!this.suppressed) this.schedule()
	}

	private async buffer(url: string): Promise<AudioBufferLike | null> {
		const cached = this.buffers.get(url)
		if (cached) return cached
		try {
			const bytes = await this.fetchBytes(url)
			const buffer = await this.context().decodeAudioData(bytes)
			this.buffers.set(url, buffer)
			return buffer
		} catch (error) {
			this.onError(url, error)
			return null
		}
	}

	/**
	 * Schedule every layer on one future timestamp. This single shared `startAt`
	 * is the whole fix: same context clock, same sample offset, and sample-exact
	 * looping from there on, so no amount of elapsed match time can pull the
	 * layers apart.
	 */
	private schedule(): void {
		if (this.scheduled || !this.ready) return
		const ctx = this.context()
		void this.resume()

		// The shortest layer sets the loop for all of them. The packs ship at
		// identical lengths, so this normally changes nothing — but if an asset is
		// ever re-encoded a few samples long, a shared `loopEnd` keeps the bed
		// locked instead of letting one layer walk away from the rest.
		const loop = Math.min(...this.stems.map((s) => s.buffer?.duration ?? 0))
		if (!Number.isFinite(loop) || loop <= 0) return

		const startAt = ctx.currentTime + BED_LEAD_IN_SECONDS
		for (const stem of this.stems) {
			const source = ctx.createBufferSource()
			source.buffer = stem.buffer
			source.loop = true
			source.loopStart = 0
			source.loopEnd = loop
			source.connect(stem.gain)
			source.start(startAt)
			stem.source = source
		}
		this.startedAt = startAt
		this.loopLength = loop
		this.scheduled = true
	}

	setGains(gains: ReadonlyMap<string, number>, fadeMs: number): void {
		if (!this.ctx) return
		const now = this.ctx.currentTime
		const end = now + Math.max(0, fadeMs) / 1000
		for (const stem of this.stems) {
			const target = clamp01(gains.get(stem.name) ?? 0)
			const param = stem.gain.gain
			// Read the live value first: a re-target mid-fade then continues from
			// where the ramp actually is rather than jumping back to its origin.
			const current = param.value
			param.cancelScheduledValues(now)
			param.setValueAtTime(current, now)
			if (end > now) param.linearRampToValueAtTime(target, end)
			else param.setValueAtTime(target, now)
		}
	}

	setOutputGain(gain: number): void {
		this.outputGain = clamp01(gain)
		if (!this.ctx || !this.output) return
		const now = this.ctx.currentTime
		const param = this.output.gain
		const current = param.value
		param.cancelScheduledValues(now)
		param.setValueAtTime(current, now)
		param.linearRampToValueAtTime(this.outputGain, now + OUTPUT_RAMP_SECONDS)
	}

	setSuppressed(suppressed: boolean): void {
		this.suppressed = suppressed
		// Un-suppressing starts a bed that was held back; suppressing one that is
		// already running leaves it alone, since its gain is already zero.
		if (!suppressed) this.schedule()
	}

	gains(): ReadonlyMap<string, number> {
		const out = new Map<string, number>()
		for (const stem of this.stems) out.set(stem.name, stem.gain.gain.value)
		return out
	}

	position(): number | null {
		if (!this.ctx || !this.scheduled || this.loopLength === null) return null
		const elapsed = this.ctx.currentTime - this.startedAt
		if (elapsed < 0) return 0 // scheduled, inside the lead-in
		return elapsed % this.loopLength
	}

	loopSeconds(): number | null {
		return this.scheduled ? this.loopLength : null
	}

	stop(): void {
		this.generation += 1
		for (const stem of this.stems) {
			if (stem.source) {
				try {
					stem.source.stop()
				} catch {
					// Never started (context died mid-schedule) — nothing to stop.
				}
				stem.source.disconnect()
			}
			stem.gain.disconnect()
		}
		this.stems = []
		this.ready = false
		this.scheduled = false
		this.loopLength = null
		this.startedAt = 0
	}

	status(): MusicBedStatus {
		return {
			contextState: this.contextState(),
			stems: this.stems.length,
			ready: this.ready,
			scheduled: this.scheduled,
			loopSeconds: this.loopSeconds(),
			position: this.position(),
			buffered: this.buffers.size,
		}
	}

	/** Build the context and master node on first use, never at import time. */
	private context(): BedContextLike {
		if (!this.ctx) {
			this.ctx = this.createContext()
			this.output = this.ctx.createGain()
			this.output.gain.value = this.outputGain
			this.output.connect(this.ctx.destination)
		}
		return this.ctx
	}
}

/**
 * Browser bed, or `null` during SSR / where Web Audio is missing. The gesture
 * unlock is registered here rather than inside the bed: a suspended context
 * scheduled before the player has clicked anything would otherwise sit silent
 * forever, since `resume()` only succeeds off the back of a gesture.
 */
export function browserMusicBed(): MusicBed | null {
	if (typeof window === 'undefined') return null
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
	if (!Ctor) return null

	const bed = new WebAudioMusicBed({
		createContext: () => new Ctor() as unknown as BedContextLike,
		onError: (url, error) => console.warn(`[audio] failed to load music layer ${url}`, error),
	})

	const events = ['pointerdown', 'keydown', 'touchstart'] as const
	const unlock = (): void => {
		void bed.resume().then(() => {
			if (bed.contextState() !== 'running') return
			for (const event of events) window.removeEventListener(event, unlock, true)
		})
	}
	for (const event of events) {
		window.addEventListener(event, unlock, { capture: true, passive: true })
	}

	return bed
}
