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
import {
	browserMusicBed,
	type MusicBed,
	type MusicBedStatus,
	type StemSource,
} from '$lib/Audio/musicBed'

/**
 * Audio playback engine with three independent channels:
 *
 *  - `music` — adaptive stem layer (multiple looping tracks playing
 *              simultaneously, BPM/key-aligned, with per-stem gain crossfades)
 *              plus a single-active one-shot path for non-looping stings.
 *  - `env`   — single-active looping track (weather).
 *  - `sfx`   — pooled, fire-and-forget; the same effect can overlap itself.
 *
 * The stem layer keeps every layer of the match's pack loaded and running
 * together once the match begins. State changes (turn flips, AI thinking, etc.)
 * move the per-stem target gains and the bed ramps them — never stopping or
 * restarting a layer, so the loops stay phase-locked and crossfades sound
 * musical. That bed is Web Audio, not audio elements; `musicBed.ts` explains
 * why nothing else can hold several loops in sync for a whole match. One-shot
 * stings (win/lose) still take the single-active element path, where being a
 * few milliseconds late costs nothing.
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

export interface AudioEngineOptions {
	/** `null` disables playback (SSR / headless); state machine still works. */
	factory?: AudioElementFactory | null
	preferredFormat?: AudioFormat
	settings?: AudioSettings
	/** Called whenever settings change so they can be persisted. */
	persist?: (settings: AudioSettings) => void
	/** Max simultaneous voices per distinct sfx before stealing the oldest. */
	maxSfxVoices?: number
	/** Phase-locked stem bed. `null` disables the music bed (SSR / headless). */
	bed?: MusicBed | null
}

const SINGLE_CHANNELS: SingleChannel[] = ['music', 'env']

export class AudioEngine {
	private state: AudioState
	private readonly factory: AudioElementFactory | null
	private readonly format: AudioFormat
	private readonly persist: (settings: AudioSettings) => void
	private readonly maxSfxVoices: number
	private readonly bed: MusicBed | null

	/** One live element per single-active channel. */
	private readonly singleEls: Record<SingleChannel, AudioElementLike | null> = {
		music: null,
		env: null,
	}
	/** Decoded looping elements cached by resolved URL (lazy-loaded). */
	private readonly trackCache = new Map<string, AudioElementLike>()
	/** Overlapping voice pool per sfx logical name. */
	private readonly sfxPool = new Map<string, AudioElementLike[]>()

	/**
	 * Target gain per loaded stem. Only the targets live here — the rendered
	 * gains are `AudioParam` values owned by the bed, so there is no second copy
	 * of them to fall out of step.
	 */
	private readonly stemTargets = new Map<string, number>()

	/**
	 * Runtime-only ducking multiplier for the `env` channel (0..1). Lets weather
	 * ambience sit beneath the music bed without overwriting — and thus losing —
	 * the player's own env volume preference. Not persisted; recomputed each play.
	 */
	private envDuck = 1

	constructor(opts: AudioEngineOptions = {}) {
		this.factory = opts.factory ?? null
		this.format = opts.preferredFormat ?? 'ogg'
		this.persist = opts.persist ?? (() => {})
		this.maxSfxVoices = opts.maxSfxVoices ?? 8
		this.bed = opts.bed ?? null
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

	/**
	 * When sound is off (master muted) we never call `el.play()`. A muted element
	 * is still *playing* as far as the OS is concerned, which on iOS/macOS grabs
	 * the audio session and can interrupt the user's own music or yank a Bluetooth
	 * device into a call profile. So if a player mutes and then loads a fresh
	 * match, nothing autostarts — we keep elements primed (src/volume set) and
	 * resume them only once they un-mute (see `resumeSuppressedPlayback`).
	 */
	private get playbackSuppressed(): boolean {
		return this.state.master.muted
	}

	// ── Music (single-active one-shot path; used for non-looping stings) ─────
	playMusic(name: string, opts: PlaySingleOptions = {}): void {
		this.playSingle('music', name, opts)
	}
	stopMusic(): void {
		this.stopSingle('music')
	}

	// ── Music stem layer (phase-locked bed, gain-crossfaded) ─────────────────

	/**
	 * Load and start every named music stem together on the phase-locked bed.
	 * All layers begin on one scheduled instant at gain 0 — audible only once
	 * `setMusicMix` raises a target — and stay sample-aligned for the rest of the
	 * match. We never stop and restart a layer afterward.
	 *
	 * Safe to call with no bed (SSR / headless): targets are tracked, nothing is
	 * fetched, decoded or played.
	 */
	startMusicStems(names: readonly string[]): void {
		// Reset any prior stem set — switching maps or restarting a match.
		this.stopMusicStems()
		const sources: StemSource[] = []
		for (const name of names) {
			const base = lookupAudio('music', name)
			if (base === undefined) {
				console.warn(`[audio] unknown music stem "${name}"`)
				continue
			}
			this.stemTargets.set(name, 0)
			sources.push({ name, url: resolveAudioPath(base, this.format) })
		}
		if (!this.bed || sources.length === 0) return
		// Stay decoded but unscheduled when sound is off; un-muting then starts the
		// whole bed on one instant, so nothing has drifted in the meantime.
		this.bed.setSuppressed(this.playbackSuppressed)
		this.bed.setOutputGain(effectiveVolume(this.state, 'music'))
		this.bed.start(sources)
	}

	/**
	 * Set the target gain of every loaded stem and crossfade toward it. Stems not
	 * present in `mix` are driven to 0. A `fadeMs` of `0` snaps instantly (useful
	 * for tests and hard cuts).
	 *
	 * Re-targeting mid-fade continues from wherever the ramp actually is rather
	 * than jumping, and the ramp is `AudioParam` automation on the audio thread —
	 * so unlike the old `requestAnimationFrame` tween it still completes at the
	 * right rate while the tab is hidden.
	 */
	setMusicMix(mix: MusicMix, opts: MusicMixOptions = {}): void {
		const fadeMs = Math.max(0, opts.fadeMs ?? 800)
		for (const name of this.stemTargets.keys()) {
			this.stemTargets.set(name, clampVolume(mix[name] ?? 0))
		}
		this.bed?.setGains(this.stemTargets, fadeMs)
	}

	/** Snapshot of the loaded stems and their current gains (for tests / UI). */
	getMusicStems(): ReadonlyMap<string, { currentGain: number; targetGain: number }> {
		const live = this.bed?.gains()
		const out = new Map<string, { currentGain: number; targetGain: number }>()
		for (const [name, targetGain] of this.stemTargets) {
			// No bed means no automation to read, so the target *is* the gain.
			out.set(name, { currentGain: live?.get(name) ?? targetGain, targetGain })
		}
		return out
	}

	/**
	 * Playback position of the stem bed in seconds, or `null` when it is not
	 * running. Read off the audio clock rather than off any one layer, so it
	 * speaks for the whole bed — every layer sits at this position by
	 * construction, not by luck.
	 *
	 * `null` before the bed is scheduled (still decoding, or held back because
	 * sound is off) is intentional: it tells the phrase clock to re-baseline
	 * rather than to read the eventual start as a huge forward jump.
	 */
	getMusicPosition(): number | null {
		return this.bed?.position() ?? null
	}

	/** Bed diagnostics for the audio dev board. `null` when there is no bed. */
	getMusicBedStatus(): MusicBedStatus | null {
		return this.bed?.status() ?? null
	}

	/**
	 * Stop the bed and release its sources and gain nodes. Its decoded layers are
	 * kept, so restarting the same pack does not pay for the download again.
	 */
	stopMusicStems(): void {
		this.stemTargets.clear()
		this.bed?.stop()
	}

	/** Push the music channel's effective volume onto the bed's master gain. */
	private syncMusicStemVolumes(): void {
		this.bed?.setOutputGain(effectiveVolume(this.state, 'music'))
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
		el.volume = this.outputVolume(channel)
		this.singleEls[channel] = el
		if (!this.playbackSuppressed) void el.play()
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
		// Fire-and-forget: when sound is off there is nothing to resume later, so
		// just drop it rather than grabbing the audio session for a silent voice.
		if (this.playbackSuppressed) return

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
	/**
	 * Set the runtime env ducking multiplier (0..1) and re-sync live volumes.
	 * Composes with the persisted env channel volume rather than replacing it.
	 */
	setEnvDuck(multiplier: number): void {
		this.envDuck = clampVolume(multiplier)
		this.syncVolumes()
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

	/** Effective element gain, folding in the env duck for the `env` channel. */
	private outputVolume(channel: AudioChannel): number {
		const base = effectiveVolume(this.state, channel)
		return channel === 'env' ? clampVolume(base * this.envDuck) : base
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
			if (el) el.volume = this.outputVolume(channel)
		}
		this.syncMusicStemVolumes()
		// Sound-off gate for the bed: one that is still decoding while muted must
		// not schedule itself, and un-muting has to let it start.
		this.bed?.setSuppressed(this.playbackSuppressed)
		const sfxVol = effectiveVolume(this.state, 'sfx')
		for (const pool of this.sfxPool.values()) {
			for (const el of pool) if (!el.paused) el.volume = sfxVol
		}
		// Sound was off and is now back on: start the looping elements we kept
		// primed but never played (one per single channel).
		if (!this.playbackSuppressed) this.resumeSuppressedPlayback()
	}

	/**
	 * Resume looping playback for elements that were primed while muted. SFX are
	 * transient and intentionally not resumed — a missed effect just stays missed.
	 * The stem bed is handled by `setSuppressed`, which starts every layer
	 * together rather than resuming them one at a time.
	 */
	private resumeSuppressedPlayback(): void {
		for (const channel of SINGLE_CHANNELS) {
			const el = this.singleEls[channel]
			if (el && el.paused) void el.play()
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
	bed: browserMusicBed(),
	preferredFormat: detectPreferredFormat(),
	settings: get(audioSettings),
	persist: (settings) => audioSettings.set(settings),
})
