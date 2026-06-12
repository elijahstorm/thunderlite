import { browser } from '$app/environment'
import { get } from 'svelte/store'
import {
	audioSettings,
	defaultAudioSettings,
	type AudioSettings,
	type ChannelSettings,
} from '$lib/Stores/audioSettings'
import {
	lookupAudio,
	resolveAudioPath,
	AUDIO_MIME,
	type AudioChannel,
	type AudioFormat,
} from '$lib/Audio/assetManifest'

/**
 * Audio playback engine with three independent channels:
 *
 *  - `music` — adaptive stem layer (multiple looping tracks playing
 *              simultaneously, BPM/key-aligned, with per-stem gain crossfades)
 *              plus a single-active one-shot path for non-looping stings.
 *  - `env`   — single-active looping track (weather).
 *  - `sfx`   — pooled, fire-and-forget; the same effect can overlap itself.
 *
 * The stem layer keeps every mood track loaded and running together once the
 * match begins. State changes (turn flips, AI thinking, etc.) move the
 * per-stem target gains and the engine tweens them — never stopping/restarting
 * a stem, so the loops stay phase-locked and crossfades sound musical. One-shot
 * stings (win/lose) still take the legacy single-active path.
 *
 * The "which track is active per channel + volume/mute flags" portion is a
 * plain object manipulated by pure functions (see `AudioState` below), so the
 * state machine is fully unit-testable without real audio playback. Actual
 * playback is delegated to an injectable element factory, which is `null`
 * during SSR — no `Audio` is ever constructed on the server.
 */

export type SingleChannel = 'music' | 'env'
export type ChannelKey = 'master' | AudioChannel

/** Options for a single-active (music/env) playback request. */
export interface PlaySingleOptions {
	/** Loop the track (default `true`). One-shot stings (win/lose) pass `false`. */
	loop?: boolean
}

/** Per-stem target gains (0..1) for the music stem layer. Missing stems → 0. */
export type MusicMix = Readonly<Record<string, number>>

/** Options for stem-layer mix changes. */
export interface MusicMixOptions {
	/** Crossfade duration in milliseconds (default `800`). `0` snaps instantly. */
	fadeMs?: number
}

/** Pure, serializable channel state machine. */
export interface AudioState {
	master: ChannelSettings
	music: ChannelSettings
	sfx: ChannelSettings
	env: ChannelSettings
	/** Logical name of the looping track currently active per single channel. */
	active: { music: string | null; env: string | null }
}

/** Clamp a volume into the inclusive 0..1 range (NaN → 0). */
export function clampVolume(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.min(1, Math.max(0, value))
}

export function createAudioState(settings: AudioSettings = defaultAudioSettings()): AudioState {
	return {
		master: { ...settings.master },
		music: { ...settings.music },
		sfx: { ...settings.sfx },
		env: { ...settings.env },
		active: { music: null, env: null },
	}
}

/** Extract the persistable subset (drops active-track runtime info). */
export function settingsFromState(state: AudioState): AudioSettings {
	return {
		master: { ...state.master },
		music: { ...state.music },
		sfx: { ...state.sfx },
		env: { ...state.env },
	}
}

export function withChannelVolume(
	state: AudioState,
	channel: ChannelKey,
	volume: number
): AudioState {
	return { ...state, [channel]: { ...state[channel], volume: clampVolume(volume) } }
}

export function withChannelMute(
	state: AudioState,
	channel: ChannelKey,
	muted: boolean
): AudioState {
	return { ...state, [channel]: { ...state[channel], muted } }
}

export function withActiveTrack(
	state: AudioState,
	channel: SingleChannel,
	track: string | null
): AudioState {
	return { ...state, active: { ...state.active, [channel]: track } }
}

/**
 * Effective output gain for a channel: zero if either the master or the
 * channel itself is muted, otherwise the product of both volumes.
 */
export function effectiveVolume(state: AudioState, channel: AudioChannel): number {
	if (state.master.muted || state[channel].muted) return 0
	return clampVolume(state.master.volume * state[channel].volume)
}

/** Minimal surface of `HTMLAudioElement` the engine actually drives. */
export interface AudioElementLike {
	src: string
	loop: boolean
	volume: number
	currentTime: number
	paused: boolean
	ended: boolean
	play(): Promise<void> | void
	pause(): void
}

export type AudioElementFactory = () => AudioElementLike

/**
 * Pluggable scheduler for stem-fade tweens. Lets tests advance fades
 * deterministically (no rAF / wall-clock) and lets the browser path use
 * `requestAnimationFrame` + `performance.now`.
 */
export interface FadeScheduler {
	/** Current time in ms (monotonic; only deltas are used). */
	now: () => number
	/** Schedule a frame callback. Returns a cancel handle. */
	requestFrame: (cb: () => void) => () => void
}

export interface AudioEngineOptions {
	/** `null` disables playback (SSR / headless); state machine still works. */
	factory?: AudioElementFactory | null
	preferredFormat?: AudioFormat
	settings?: AudioSettings
	/** Called whenever settings change so they can be persisted. */
	persist?: (settings: AudioSettings) => void
	/** Max simultaneous voices per distinct sfx before stealing the oldest. */
	maxSfxVoices?: number
	/** Stem-fade scheduler. Defaults to rAF + `performance.now` in the browser. */
	fadeScheduler?: FadeScheduler
}

interface MusicStem {
	el: AudioElementLike
	/** Currently rendered gain (animated toward `targetGain`). */
	currentGain: number
	/** Gain the active fade is approaching. */
	targetGain: number
	/** Gain at the time the active fade started (interp origin). */
	fadeFromGain: number
}

const SINGLE_CHANNELS: SingleChannel[] = ['music', 'env']

export class AudioEngine {
	private state: AudioState
	private readonly factory: AudioElementFactory | null
	private readonly format: AudioFormat
	private readonly persist: (settings: AudioSettings) => void
	private readonly maxSfxVoices: number
	private readonly fadeScheduler: FadeScheduler

	/** One live element per single-active channel. */
	private readonly singleEls: Record<SingleChannel, AudioElementLike | null> = {
		music: null,
		env: null,
	}
	/** Decoded looping elements cached by resolved URL (lazy-loaded). */
	private readonly trackCache = new Map<string, AudioElementLike>()
	/** Overlapping voice pool per sfx logical name. */
	private readonly sfxPool = new Map<string, AudioElementLike[]>()

	/** Loaded music stems — all looping in lockstep once started. */
	private readonly musicStems = new Map<string, MusicStem>()
	/** Pending fade tween, if any. */
	private fadeStart = 0
	private fadeDuration = 0
	private fadeCancel: (() => void) | null = null

	constructor(opts: AudioEngineOptions = {}) {
		this.factory = opts.factory ?? null
		this.format = opts.preferredFormat ?? 'ogg'
		this.persist = opts.persist ?? (() => {})
		this.maxSfxVoices = opts.maxSfxVoices ?? 8
		this.fadeScheduler = opts.fadeScheduler ?? defaultFadeScheduler()
		this.state = createAudioState(opts.settings)
	}

	getState(): Readonly<AudioState> {
		return this.state
	}

	getActiveTrack(channel: SingleChannel): string | null {
		return this.state.active[channel]
	}

	getSettings(): AudioSettings {
		return settingsFromState(this.state)
	}

	// ── Music (single-active one-shot path; used for non-looping stings) ─────
	playMusic(name: string, opts: PlaySingleOptions = {}): void {
		this.playSingle('music', name, opts)
	}
	stopMusic(): void {
		this.stopSingle('music')
	}

	// ── Music stem layer (adaptive, BPM-aligned, crossfaded) ─────────────────

	/**
	 * Load and start every named music stem together. All stems begin at
	 * `currentTime = 0`, loop, and play at gain 0 — so they're audible only
	 * once `setMusicMix` raises a stem's target. Starting them in lockstep is
	 * what keeps the BPM-/key-aligned crossfades sounding musical; we never
	 * stop and restart a stem afterward.
	 *
	 * Safe to call when no factory is configured (SSR/headless): the state is
	 * tracked but no Audio elements are created.
	 */
	startMusicStems(names: readonly string[]): void {
		// Reset any prior stem set — switching maps or restarting a match.
		this.stopMusicStems()
		if (!this.factory) return
		for (const name of names) {
			const base = lookupAudio('music', name)
			if (base === undefined) {
				console.warn(`[audio] unknown music stem "${name}"`)
				continue
			}
			const el = this.acquireTrackElement(resolveAudioPath(base, this.format))
			el.loop = true
			el.currentTime = 0
			el.volume = 0
			this.musicStems.set(name, {
				el,
				currentGain: 0,
				targetGain: 0,
				fadeFromGain: 0,
			})
			void el.play()
		}
	}

	/**
	 * Set the target gain of every loaded stem and crossfade toward it.
	 * Stems not present in `mix` are driven to 0. A `fadeMs` of `0` snaps
	 * instantly (useful for tests and hard cuts).
	 */
	setMusicMix(mix: MusicMix, opts: MusicMixOptions = {}): void {
		const fadeMs = Math.max(0, opts.fadeMs ?? 800)
		// Snapshot current gains as the fade origin so re-targets mid-fade
		// don't jump — they continue smoothly from where they were.
		for (const [name, stem] of this.musicStems) {
			stem.fadeFromGain = stem.currentGain
			stem.targetGain = clampVolume(mix[name] ?? 0)
		}
		this.cancelFade()
		// Snap when there's nothing to animate, no work requested, or no
		// scheduler (SSR / headless — no Audio is sounding anyway).
		if (fadeMs === 0 || this.musicStems.size === 0 || !this.factory) {
			for (const stem of this.musicStems.values()) stem.currentGain = stem.targetGain
			this.syncMusicStemVolumes()
			return
		}
		this.fadeDuration = fadeMs
		this.fadeStart = this.fadeScheduler.now()
		this.scheduleFadeFrame()
	}

	/** Snapshot of the loaded stems and their current gains (for tests / UI). */
	getMusicStems(): ReadonlyMap<string, { currentGain: number; targetGain: number }> {
		const out = new Map<string, { currentGain: number; targetGain: number }>()
		for (const [name, stem] of this.musicStems) {
			out.set(name, { currentGain: stem.currentGain, targetGain: stem.targetGain })
		}
		return out
	}

	/** Pause and discard every loaded stem. Cancels any in-flight fade. */
	stopMusicStems(): void {
		this.cancelFade()
		for (const stem of this.musicStems.values()) {
			stem.el.pause()
			stem.el.volume = 0
		}
		this.musicStems.clear()
	}

	private cancelFade(): void {
		if (this.fadeCancel) {
			this.fadeCancel()
			this.fadeCancel = null
		}
	}

	private scheduleFadeFrame(): void {
		this.fadeCancel = this.fadeScheduler.requestFrame(() => {
			this.fadeCancel = null
			this.tickFade()
		})
	}

	private tickFade(): void {
		const elapsed = this.fadeScheduler.now() - this.fadeStart
		const t = this.fadeDuration > 0 ? Math.min(1, Math.max(0, elapsed / this.fadeDuration)) : 1
		let active = false
		for (const stem of this.musicStems.values()) {
			const next = stem.fadeFromGain + (stem.targetGain - stem.fadeFromGain) * t
			stem.currentGain = next
			if (next !== stem.targetGain) active = true
		}
		this.syncMusicStemVolumes()
		if (active && t < 1) this.scheduleFadeFrame()
	}

	/** Push current effective volume × per-stem gain onto each stem element. */
	private syncMusicStemVolumes(): void {
		const channelVol = effectiveVolume(this.state, 'music')
		for (const stem of this.musicStems.values()) {
			stem.el.volume = clampVolume(channelVol * stem.currentGain)
		}
	}

	// ── Environment / weather (single-active) ─────────────────────────────────
	playEnv(name: string, opts: PlaySingleOptions = {}): void {
		this.playSingle('env', name, opts)
	}
	stopEnv(): void {
		this.stopSingle('env')
	}

	private playSingle(channel: SingleChannel, name: string, opts: PlaySingleOptions = {}): void {
		const loop = opts.loop ?? true
		const base = lookupAudio(channel, name)
		if (base === undefined) {
			console.warn(`[audio] unknown ${channel} track "${name}"`)
			return
		}

		// Already looping this exact track — don't restart it.
		const current = this.singleEls[channel]
		if (this.state.active[channel] === name && current && !current.paused) return

		// Stop whatever is currently playing on this channel — no overlap.
		if (current) {
			current.pause()
			current.currentTime = 0
		}

		this.state = withActiveTrack(this.state, channel, name)
		if (!this.factory) return // headless / SSR: track recorded, nothing to play

		const el = this.acquireTrackElement(resolveAudioPath(base, this.format))
		el.loop = loop
		el.currentTime = 0
		el.volume = effectiveVolume(this.state, channel)
		this.singleEls[channel] = el
		void el.play()
	}

	private stopSingle(channel: SingleChannel): void {
		const current = this.singleEls[channel]
		if (current) {
			current.pause()
			current.currentTime = 0
		}
		this.singleEls[channel] = null
		this.state = withActiveTrack(this.state, channel, null)
	}

	private acquireTrackElement(url: string): AudioElementLike {
		let el = this.trackCache.get(url)
		if (!el) {
			el = this.factory!()
			el.src = url
			this.trackCache.set(url, el)
		}
		return el
	}

	// ── Sound effects (pooled, overlapping) ───────────────────────────────────
	playSfx(name: string): void {
		const base = lookupAudio('sfx', name)
		if (base === undefined) {
			console.warn(`[audio] unknown sfx "${name}"`)
			return
		}
		if (!this.factory) return

		const el = this.acquireSfxVoice(name, resolveAudioPath(base, this.format))
		el.currentTime = 0
		el.volume = effectiveVolume(this.state, 'sfx')
		void el.play()
	}

	private acquireSfxVoice(name: string, url: string): AudioElementLike {
		let pool = this.sfxPool.get(name)
		if (!pool) {
			pool = []
			this.sfxPool.set(name, pool)
		}

		// Reuse a free voice (finished or never started) so repeats overlap
		// instead of restarting the one busy element.
		const idle = pool.find((e) => e.paused || e.ended)
		if (idle) return idle

		if (pool.length < this.maxSfxVoices) {
			const el = this.factory!()
			el.src = url
			pool.push(el)
			return el
		}

		// All voices busy and the pool is full — steal the oldest one.
		const stolen = pool[0]
		stolen.pause()
		return stolen
	}

	// ── Settings ──────────────────────────────────────────────────────────────
	setMasterVolume(volume: number): void {
		this.commit(withChannelVolume(this.state, 'master', volume))
	}
	setChannelVolume(channel: AudioChannel, volume: number): void {
		this.commit(withChannelVolume(this.state, channel, volume))
	}
	setMasterMute(muted: boolean): void {
		this.commit(withChannelMute(this.state, 'master', muted))
	}
	setMute(channel: AudioChannel, muted: boolean): void {
		this.commit(withChannelMute(this.state, channel, muted))
	}
	toggleMute(channel: AudioChannel): void {
		this.setMute(channel, !this.state[channel].muted)
	}

	/** Replace all volume/mute settings at once (e.g. from a settings UI). */
	applySettings(settings: AudioSettings): void {
		this.commit({ ...createAudioState(settings), active: { ...this.state.active } })
	}

	private commit(next: AudioState): void {
		this.state = next
		this.syncVolumes()
		this.persist(this.getSettings())
	}

	/** Push the current effective volumes onto every live element. */
	private syncVolumes(): void {
		for (const channel of SINGLE_CHANNELS) {
			const el = this.singleEls[channel]
			if (el) el.volume = effectiveVolume(this.state, channel)
		}
		this.syncMusicStemVolumes()
		const sfxVol = effectiveVolume(this.state, 'sfx')
		for (const pool of this.sfxPool.values()) {
			for (const el of pool) if (!el.paused) el.volume = sfxVol
		}
	}
}

// ── Browser singleton ────────────────────────────────────────────────────────

function browserFactory(): AudioElementFactory | null {
	if (!browser || typeof Audio === 'undefined') return null
	return () => new Audio() as unknown as AudioElementLike
}

/**
 * Default stem-fade scheduler. Uses `requestAnimationFrame` + `performance.now`
 * in the browser; degrades to a no-op (which makes the engine snap straight to
 * the target gain on each `setMusicMix`) during SSR / headless tests.
 */
function defaultFadeScheduler(): FadeScheduler {
	if (!browser || typeof requestAnimationFrame === 'undefined') {
		return { now: () => 0, requestFrame: () => () => {} }
	}
	return {
		now: () => performance.now(),
		requestFrame: (cb) => {
			const id = requestAnimationFrame(cb)
			return () => cancelAnimationFrame(id)
		},
	}
}

let preferredFormat: AudioFormat | null = null
/** Negotiate the playback format once: prefer `.ogg`, fall back to `.mp3`. */
function detectPreferredFormat(): AudioFormat {
	if (preferredFormat) return preferredFormat
	if (!browser || typeof Audio === 'undefined') {
		preferredFormat = 'ogg'
		return preferredFormat
	}
	try {
		const probe = new Audio()
		if (probe.canPlayType(AUDIO_MIME.ogg) !== '') preferredFormat = 'ogg'
		else if (probe.canPlayType(AUDIO_MIME.mp3) !== '') preferredFormat = 'mp3'
		else preferredFormat = 'ogg'
	} catch {
		preferredFormat = 'ogg'
	}
	return preferredFormat
}

/** Shared, app-wide engine instance. Safe to import during SSR. */
export const audioEngine = new AudioEngine({
	factory: browserFactory(),
	preferredFormat: detectPreferredFormat(),
	settings: get(audioSettings),
	persist: (settings) => audioSettings.set(settings),
})
