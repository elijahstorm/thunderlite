// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import {
	AudioEngine,
	createAudioState,
	effectiveVolume,
	withChannelVolume,
	withChannelMute,
	withActiveTrack,
	clampVolume,
	settingsFromState,
	type AudioElementLike,
	type FadeScheduler,
} from '../../src/lib/Audio/audioEngine'
import {
	defaultAudioSettings,
	loadAudioSettings,
	saveAudioSettings,
	normalizeAudioSettings,
	type AudioSettings,
} from '../../src/lib/Stores/audioSettings'

// ── Fakes ─────────────────────────────────────────────────────────────────────

class FakeAudio implements AudioElementLike {
	src = ''
	loop = false
	volume = 1
	currentTime = 0
	paused = true
	ended = false
	play(): void {
		this.paused = false
		this.ended = false
	}
	pause(): void {
		this.paused = true
	}
}

function makeFactory() {
	const created: FakeAudio[] = []
	const factory = () => {
		const el = new FakeAudio()
		created.push(el)
		return el
	}
	return { factory, created }
}

function makeEngine(settings: AudioSettings = defaultAudioSettings()) {
	const { factory, created } = makeFactory()
	const persisted: AudioSettings[] = []
	const engine = new AudioEngine({
		factory,
		preferredFormat: 'ogg',
		settings,
		persist: (s) => persisted.push(s),
	})
	return { engine, created, persisted }
}

/**
 * Deterministic fade scheduler: tests advance time manually and `tick()` flushes
 * any scheduled callback. Lets us inspect fade midpoints without rAF or timers.
 */
function makeFadeScheduler() {
	let now = 0
	let pending: (() => void) | null = null
	const scheduler: FadeScheduler = {
		now: () => now,
		requestFrame: (cb) => {
			pending = cb
			return () => {
				if (pending === cb) pending = null
			}
		},
	}
	return {
		scheduler,
		advance(ms: number) {
			now += ms
		},
		tick() {
			const cb = pending
			pending = null
			cb?.()
		},
		hasPending: () => pending !== null,
	}
}

function makeStemEngine(settings: AudioSettings = defaultAudioSettings()) {
	const { factory, created } = makeFactory()
	const clock = makeFadeScheduler()
	const engine = new AudioEngine({
		factory,
		preferredFormat: 'ogg',
		settings,
		fadeScheduler: clock.scheduler,
	})
	return { engine, created, clock }
}

class MemoryStorage {
	private store = new Map<string, string>()
	getItem(key: string) {
		return this.store.has(key) ? this.store.get(key)! : null
	}
	setItem(key: string, value: string) {
		this.store.set(key, value)
	}
}

// ── Pure state machine ─────────────────────────────────────────────────────────

describe('audio state machine (pure)', () => {
	it('clamps volumes to 0..1 and treats NaN as 0', () => {
		expect(clampVolume(1.5)).toBe(1)
		expect(clampVolume(-0.2)).toBe(0)
		expect(clampVolume(0.5)).toBe(0.5)
		expect(clampVolume(NaN)).toBe(0)
	})

	it('records the active track per single-active channel', () => {
		let state = createAudioState()
		expect(state.active.music).toBeNull()
		state = withActiveTrack(state, 'music', 'game/player')
		expect(state.active.music).toBe('game/player')
		expect(state.active.env).toBeNull()
		state = withActiveTrack(state, 'music', 'game/enemy')
		expect(state.active.music).toBe('game/enemy')
	})

	it('multiplies master × channel volume for effective gain', () => {
		const state = createAudioState({
			...defaultAudioSettings(),
			master: { volume: 0.5, muted: false },
			music: { volume: 0.6, muted: false },
		})
		expect(effectiveVolume(state, 'music')).toBeCloseTo(0.3)
	})

	it('mutes a single channel without affecting the others', () => {
		let state = createAudioState()
		state = withChannelMute(state, 'music', true)
		expect(effectiveVolume(state, 'music')).toBe(0)
		expect(effectiveVolume(state, 'sfx')).toBeGreaterThan(0)
	})

	it('master mute silences every channel', () => {
		const state = withChannelMute(createAudioState(), 'master', true)
		expect(effectiveVolume(state, 'music')).toBe(0)
		expect(effectiveVolume(state, 'sfx')).toBe(0)
		expect(effectiveVolume(state, 'env')).toBe(0)
	})

	it('volume updates are immutable (return new state)', () => {
		const state = createAudioState()
		const next = withChannelVolume(state, 'sfx', 0.25)
		expect(next).not.toBe(state)
		expect(state.sfx.volume).toBe(1)
		expect(next.sfx.volume).toBe(0.25)
	})

	it('settingsFromState drops runtime active-track info', () => {
		const state = withActiveTrack(createAudioState(), 'music', 'game/player')
		expect(settingsFromState(state)).not.toHaveProperty('active')
	})
})

// ── Playback behaviour (fake elements) ──────────────────────────────────────────

describe('music channel (single-active)', () => {
	it('loops the requested track', () => {
		const { engine, created } = makeEngine()
		engine.playMusic('game/player')
		expect(engine.getActiveTrack('music')).toBe('game/player')
		const playing = created.filter((e) => !e.paused)
		expect(playing).toHaveLength(1)
		expect(playing[0].loop).toBe(true)
		expect(playing[0].src).toContain('player')
	})

	it('swaps tracks with no overlap', () => {
		const { engine, created } = makeEngine()
		engine.playMusic('game/player')
		const first = created.find((e) => e.src.includes('player'))!
		engine.playMusic('game/enemy')

		expect(engine.getActiveTrack('music')).toBe('game/enemy')
		expect(first.paused).toBe(true) // old track stopped
		const playing = created.filter((e) => !e.paused)
		expect(playing).toHaveLength(1) // exactly one music element sounding
		expect(playing[0].src).toContain('enemy')
	})

	it('does not restart the same track when replayed', () => {
		const { engine, created } = makeEngine()
		engine.playMusic('game/player')
		expect(created).toHaveLength(1)
		engine.playMusic('game/player')
		expect(created).toHaveLength(1) // reused, not re-created
	})

	it('stopMusic clears the active track', () => {
		const { engine, created } = makeEngine()
		engine.playMusic('game/player')
		engine.stopMusic()
		expect(engine.getActiveTrack('music')).toBeNull()
		expect(created.every((e) => e.paused)).toBe(true)
	})
})

describe('sfx channel (pooled, overlapping)', () => {
	it('overlaps repeated effects instead of restarting one element', () => {
		const { engine, created } = makeEngine()
		engine.playSfx('explosion')
		engine.playSfx('explosion')
		engine.playSfx('explosion')

		const sounding = created.filter((e) => !e.paused && e.src.includes('explosion'))
		expect(sounding).toHaveLength(3)
	})

	it('reuses an idle voice once it has finished', () => {
		const { engine, created } = makeEngine()
		engine.playSfx('explosion')
		created[0].ended = true // simulate playback finishing
		engine.playSfx('explosion')
		expect(created).toHaveLength(1) // the freed voice was reused
	})
})

describe('cross-channel muting', () => {
	it('muting music silences music while sfx keeps playing', () => {
		const { engine, created } = makeEngine()
		engine.playMusic('game/player')
		engine.playSfx('explosion')

		engine.setMute('music', true)

		const music = created.find((e) => e.src.includes('player'))!
		const sfx = created.find((e) => e.src.includes('explosion'))!
		expect(music.volume).toBe(0)
		expect(sfx.paused).toBe(false)
		expect(sfx.volume).toBeGreaterThan(0)
	})

	it('persists settings on every change', () => {
		const { engine, persisted } = makeEngine()
		engine.setChannelVolume('sfx', 0.4)
		engine.setMute('music', true)
		expect(persisted).toHaveLength(2)
		expect(persisted[1].music.muted).toBe(true)
		expect(persisted[1].sfx.volume).toBe(0.4)
	})
})

// ── Music stem layer (adaptive crossfade) ───────────────────────────────────────

describe('music stem layer', () => {
	const STEMS = ['game/intro', 'game/player', 'game/enemy'] as const

	it('starts every stem looping, in lockstep, at gain 0', () => {
		const { engine, created } = makeStemEngine()
		engine.startMusicStems(STEMS)

		expect(created).toHaveLength(STEMS.length)
		for (const el of created) {
			expect(el.loop).toBe(true)
			expect(el.paused).toBe(false) // playing
			expect(el.currentTime).toBe(0) // aligned start
			expect(el.volume).toBe(0) // silent until mixed
		}
	})

	it('snaps to the target mix when fadeMs is 0', () => {
		const { engine, created } = makeStemEngine()
		engine.startMusicStems(STEMS)
		engine.setMusicMix({ 'game/player': 1 }, { fadeMs: 0 })

		const player = created.find((e) => e.src.includes('player'))!
		const enemy = created.find((e) => e.src.includes('enemy'))!
		const channelVol = effectiveVolume(engine.getState(), 'music')
		expect(player.volume).toBeCloseTo(channelVol)
		expect(enemy.volume).toBe(0)
	})

	it('crossfades stem gains over time without restarting any stem', () => {
		const { engine, created, clock } = makeStemEngine()
		engine.startMusicStems(STEMS)
		engine.setMusicMix({ 'game/player': 1 }, { fadeMs: 0 })

		const player = created.find((e) => e.src.includes('player'))!
		const enemy = created.find((e) => e.src.includes('enemy'))!

		// Now flip to the enemy theme with a real fade
		engine.setMusicMix({ 'game/enemy': 1 }, { fadeMs: 1000 })

		// Halfway through, both should be roughly equally loud (linear ramp)
		clock.advance(500)
		clock.tick()
		const channelVol = effectiveVolume(engine.getState(), 'music')
		expect(player.volume).toBeCloseTo(channelVol * 0.5, 2)
		expect(enemy.volume).toBeCloseTo(channelVol * 0.5, 2)
		// Neither stem ever stopped or restarted — same element, still playing
		expect(player.paused).toBe(false)
		expect(enemy.paused).toBe(false)

		// Finish the fade
		clock.advance(500)
		clock.tick()
		expect(player.volume).toBe(0)
		expect(enemy.volume).toBeCloseTo(channelVol)
	})

	it('re-targeting mid-fade continues smoothly from the current gain', () => {
		const { engine, created, clock } = makeStemEngine()
		engine.startMusicStems(STEMS)
		engine.setMusicMix({ 'game/player': 1 }, { fadeMs: 0 })

		const player = created.find((e) => e.src.includes('player'))!

		// Start fading player out toward 0
		engine.setMusicMix({}, { fadeMs: 1000 })
		clock.advance(400)
		clock.tick()
		const channelVol = effectiveVolume(engine.getState(), 'music')
		const midGain = player.volume / channelVol
		expect(midGain).toBeCloseTo(0.6, 2) // 40% faded

		// Reverse direction — re-target player back to 1
		engine.setMusicMix({ 'game/player': 1 }, { fadeMs: 1000 })
		clock.advance(0)
		clock.tick()
		// Just after re-target, still near the current 0.6 (no jump)
		expect(player.volume / channelVol).toBeCloseTo(midGain, 2)
	})

	it('stopMusicStems pauses every stem and clears the layer', () => {
		const { engine, created } = makeStemEngine()
		engine.startMusicStems(STEMS)
		engine.stopMusicStems()

		expect(created.every((e) => e.paused)).toBe(true)
		expect(engine.getMusicStems().size).toBe(0)
	})

	it('master mute silences every stem', () => {
		const { engine, created } = makeStemEngine()
		engine.startMusicStems(STEMS)
		engine.setMusicMix({ 'game/player': 1 }, { fadeMs: 0 })

		const player = created.find((e) => e.src.includes('player'))!
		expect(player.volume).toBeGreaterThan(0)

		engine.setMasterMute(true)
		expect(player.volume).toBe(0)

		engine.setMasterMute(false)
		expect(player.volume).toBeGreaterThan(0)
	})
})

// ── Persistence (survives a reload) ─────────────────────────────────────────────

describe('settings persistence', () => {
	let storage: MemoryStorage
	beforeEach(() => {
		storage = new MemoryStorage()
	})

	it('round-trips volume + mute through storage', () => {
		const settings: AudioSettings = {
			master: { volume: 0.8, muted: false },
			music: { volume: 0.3, muted: true },
			sfx: { volume: 0.9, muted: false },
			env: { volume: 0.1, muted: true },
		}
		saveAudioSettings(settings, storage)
		// simulate a fresh page load reading from the same storage
		expect(loadAudioSettings(storage)).toEqual(settings)
	})

	it('falls back to defaults when storage is empty or corrupt', () => {
		expect(loadAudioSettings(storage)).toEqual(defaultAudioSettings())
		storage.setItem('thunderlite.audio.settings.v1', '{not json')
		expect(loadAudioSettings(storage)).toEqual(defaultAudioSettings())
	})

	it('normalizes out-of-range and missing fields', () => {
		const normalized = normalizeAudioSettings({
			master: { volume: 5, muted: 'nope' },
			music: { volume: -3 },
		})
		expect(normalized.master.volume).toBe(1)
		expect(normalized.master.muted).toBe(false)
		expect(normalized.music.volume).toBe(0)
		expect(normalized.sfx).toEqual(defaultAudioSettings().sfx)
	})
})
