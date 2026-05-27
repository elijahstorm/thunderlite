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
 *  - `music` — single-active looping track (mood music).
 *  - `env`   — single-active looping track (weather).
 *  - `sfx`   — pooled, fire-and-forget; the same effect can overlap itself.
 *
 * The "which track is active per channel + volume/mute flags" portion is a
 * plain object manipulated by pure functions (see `AudioState` below), so the
 * state machine is fully unit-testable without real audio playback. Actual
 * playback is delegated to an injectable element factory, which is `null`
 * during SSR — no `Audio` is ever constructed on the server.
 */

export type SingleChannel = 'music' | 'env'
export type ChannelKey = 'master' | AudioChannel

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

export function withChannelVolume(state: AudioState, channel: ChannelKey, volume: number): AudioState {
	return { ...state, [channel]: { ...state[channel], volume: clampVolume(volume) } }
}

export function withChannelMute(state: AudioState, channel: ChannelKey, muted: boolean): AudioState {
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

export interface AudioEngineOptions {
	/** `null` disables playback (SSR / headless); state machine still works. */
	factory?: AudioElementFactory | null
	preferredFormat?: AudioFormat
	settings?: AudioSettings
	/** Called whenever settings change so they can be persisted. */
	persist?: (settings: AudioSettings) => void
	/** Max simultaneous voices per distinct sfx before stealing the oldest. */
	maxSfxVoices?: number
}

const SINGLE_CHANNELS: SingleChannel[] = ['music', 'env']

export class AudioEngine {
	private state: AudioState
	private readonly factory: AudioElementFactory | null
	private readonly format: AudioFormat
	private readonly persist: (settings: AudioSettings) => void
	private readonly maxSfxVoices: number

	/** One live element per single-active channel. */
	private readonly singleEls: Record<SingleChannel, AudioElementLike | null> = {
		music: null,
		env: null,
	}
	/** Decoded looping elements cached by resolved URL (lazy-loaded). */
	private readonly trackCache = new Map<string, AudioElementLike>()
	/** Overlapping voice pool per sfx logical name. */
	private readonly sfxPool = new Map<string, AudioElementLike[]>()

	constructor(opts: AudioEngineOptions = {}) {
		this.factory = opts.factory ?? null
		this.format = opts.preferredFormat ?? 'ogg'
		this.persist = opts.persist ?? (() => {})
		this.maxSfxVoices = opts.maxSfxVoices ?? 8
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

	// ── Music (single-active) ────────────────────────────────────────────────
	playMusic(name: string): void {
		this.playSingle('music', name)
	}
	stopMusic(): void {
		this.stopSingle('music')
	}

	// ── Environment / weather (single-active) ─────────────────────────────────
	playEnv(name: string): void {
		this.playSingle('env', name)
	}
	stopEnv(): void {
		this.stopSingle('env')
	}

	private playSingle(channel: SingleChannel, name: string): void {
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
		el.loop = true
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
