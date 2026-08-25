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
} from '../../src/lib/Audio/audioEngine'
import {
	WebAudioMusicBed,
	BED_LEAD_IN_SECONDS,
	type AudioBufferLike,
	type AudioParamLike,
	type BedContextLike,
	type BufferSourceLike,
	type GainNodeLike,
} from '../../src/lib/Audio/musicBed'
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

/** Loop length the fake decoder reports for every layer. */
const LOOP_SECONDS = 60

/**
 * Minimal `AudioParam` automation: a held anchor plus an optional linear ramp,
 * evaluated against the fake context clock. Enough to reproduce the engine's
 * only automation idiom (cancel → pin current → ramp to target) and therefore
 * to read a crossfade at any point along it.
 */
class FakeParam implements AudioParamLike {
	private anchorValue = 0
	private anchorTime = 0
	private targetValue = 0
	private targetTime = 0

	constructor(private readonly clock: { now: number }) {}

	get value(): number {
		const t = this.clock.now
		if (t <= this.anchorTime) return this.anchorValue
		if (t >= this.targetTime) return this.targetValue
		const progress = (t - this.anchorTime) / (this.targetTime - this.anchorTime)
		return this.anchorValue + (this.targetValue - this.anchorValue) * progress
	}

	set value(next: number) {
		this.setValueAtTime(next, this.clock.now)
	}

	cancelScheduledValues(when: number): void {
		this.setValueAtTime(this.value, when)
	}

	setValueAtTime(value: number, when: number): void {
		this.anchorValue = value
		this.targetValue = value
		this.anchorTime = when
		this.targetTime = when
	}

	linearRampToValueAtTime(value: number, when: number): void {
		this.targetValue = value
		this.targetTime = when
	}
}

class FakeGain implements GainNodeLike {
	readonly gain: FakeParam
	connectedTo: unknown = null
	disconnected = false
	constructor(clock: { now: number }) {
		this.gain = new FakeParam(clock)
	}
	connect(destination: unknown): void {
		this.connectedTo = destination
	}
	disconnect(): void {
		this.disconnected = true
	}
}

class FakeSource implements BufferSourceLike {
	buffer: AudioBufferLike | null = null
	loop = false
	loopStart = 0
	loopEnd = 0
	startedAt: number | null = null
	stopped = false
	connectedTo: unknown = null
	connect(destination: unknown): void {
		this.connectedTo = destination
	}
	disconnect(): void {}
	start(when = 0): void {
		this.startedAt = when
	}
	stop(): void {
		this.stopped = true
	}
}

/**
 * Fake `AudioContext` whose clock only moves when a test moves it. Because the
 * bed schedules and fades against this clock rather than wall time, both the
 * lockstep start and the crossfade curve become exactly assertable.
 */
function makeFakeAudioContext() {
	const clock = { now: 0 }
	const gainNodes: FakeGain[] = []
	const sources: FakeSource[] = []
	let decodes = 0

	const ctx: BedContextLike = {
		get currentTime() {
			return clock.now
		},
		state: 'running',
		destination: 'destination',
		createGain: () => {
			const gain = new FakeGain(clock)
			gainNodes.push(gain)
			return gain
		},
		createBufferSource: () => {
			const source = new FakeSource()
			sources.push(source)
			return source
		},
		decodeAudioData: async () => {
			decodes += 1
			return { duration: LOOP_SECONDS }
		},
		resume: async () => {},
	}

	return {
		ctx,
		gainNodes,
		sources,
		decodeCount: () => decodes,
		/** Advance the audio clock by `ms`. */
		advance: (ms: number) => {
			clock.now += ms / 1000
		},
	}
}

/** Flush the bed's fetch → decode chain, which is genuinely asynchronous. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function makeEngine(settings: AudioSettings = defaultAudioSettings()) {
	const { factory, created } = makeFactory()
	const audio = makeFakeAudioContext()
	const persisted: AudioSettings[] = []
	const bed = new WebAudioMusicBed({
		createContext: () => audio.ctx,
		fetchBytes: async () => new ArrayBuffer(8),
	})
	const engine = new AudioEngine({
		factory,
		preferredFormat: 'ogg',
		settings,
		persist: (s) => persisted.push(s),
		bed,
	})
	return { engine, created, persisted, bed, ...audio }
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
		state = withActiveTrack(state, 'music', 'game/win')
		expect(state.active.music).toBe('game/win')
		expect(state.active.env).toBeNull()
		state = withActiveTrack(state, 'music', 'game/lose')
		expect(state.active.music).toBe('game/lose')
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
		const state = withActiveTrack(createAudioState(), 'music', 'game/win')
		expect(settingsFromState(state)).not.toHaveProperty('active')
	})
})

// ── Playback behaviour (fake elements) ──────────────────────────────────────────

describe('music channel (single-active)', () => {
	it('loops the requested track', () => {
		const { engine, created } = makeEngine()
		engine.playMusic('game/win')
		expect(engine.getActiveTrack('music')).toBe('game/win')
		const playing = created.filter((e) => !e.paused)
		expect(playing).toHaveLength(1)
		expect(playing[0].loop).toBe(true)
		expect(playing[0].src).toContain('win')
	})

	it('swaps tracks with no overlap', () => {
		const { engine, created } = makeEngine()
		engine.playMusic('game/win')
		const first = created.find((e) => e.src.includes('win'))!
		engine.playMusic('game/lose')

		expect(engine.getActiveTrack('music')).toBe('game/lose')
		expect(first.paused).toBe(true) // old track stopped
		const playing = created.filter((e) => !e.paused)
		expect(playing).toHaveLength(1) // exactly one music element sounding
		expect(playing[0].src).toContain('lose')
	})

	it('does not restart the same track when replayed', () => {
		const { engine, created } = makeEngine()
		engine.playMusic('game/win')
		expect(created).toHaveLength(1)
		engine.playMusic('game/win')
		expect(created).toHaveLength(1) // reused, not re-created
	})

	it('stopMusic clears the active track', () => {
		const { engine, created } = makeEngine()
		engine.playMusic('game/win')
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
		engine.playMusic('game/win')
		engine.playSfx('explosion')

		engine.setMute('music', true)

		const music = created.find((e) => e.src.includes('win'))!
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

// ── Sound-off autostart suppression (Bluetooth / audio-session safety) ──────────

function mutedSettings(): AudioSettings {
	const s = defaultAudioSettings()
	return { ...s, master: { ...s.master, muted: true } }
}

describe('master-muted playback suppression', () => {
	it('does not autostart music or sfx when starting muted', () => {
		const { engine, created } = makeEngine(mutedSettings())
		engine.playMusic('game/win')
		engine.playSfx('explosion')

		// The looping track is primed (element exists, src/active recorded) but
		// never played, so no audio session is grabbed.
		expect(engine.getActiveTrack('music')).toBe('game/win')
		expect(created.every((e) => e.paused)).toBe(true)
	})

	it('decodes the bed but never schedules it while sound is off', async () => {
		const { engine, sources } = makeEngine(mutedSettings())
		engine.startMusicStems(['packs/pack1/layer1', 'packs/pack1/layer2'])
		await settle()

		// Nothing was scheduled, so no audio session was claimed — but the layers
		// are decoded and waiting, so un-muting is instant.
		expect(sources).toHaveLength(0)
		const status = engine.getMusicBedStatus()!
		expect(status.ready).toBe(true)
		expect(status.scheduled).toBe(false)
		expect(engine.getMusicPosition()).toBeNull()
	})

	it('starts the whole bed on one instant once sound comes back on', async () => {
		const { engine, sources } = makeEngine(mutedSettings())
		engine.startMusicStems(['packs/pack1/layer1', 'packs/pack1/layer2'])
		await settle()

		engine.setMasterMute(false)

		expect(sources).toHaveLength(2)
		expect(new Set(sources.map((s) => s.startedAt)).size).toBe(1)
	})

	it('resumes the primed single-channel track once sound is turned back on', () => {
		const { engine, created } = makeEngine(mutedSettings())
		engine.playEnv('weather/rain')
		expect(created.every((e) => e.paused)).toBe(true)

		engine.setMasterMute(false)

		expect(created.every((e) => !e.paused)).toBe(true)
		const env = created.find((e) => e.src.includes('rain'))!
		expect(env.volume).toBeGreaterThan(0)
	})

	it('drops sfx fired while muted rather than replaying them on unmute', () => {
		const { engine, created } = makeEngine(mutedSettings())
		engine.playSfx('explosion')
		// Nothing was even created for a dropped fire-and-forget effect.
		expect(created).toHaveLength(0)

		engine.setMasterMute(false)
		expect(created).toHaveLength(0)
	})
})

// ── Music stem layer (phase-locked Web Audio bed) ──────────────────────────────

describe('music stem layer', () => {
	const STEMS = ['packs/pack1/layer1', 'packs/pack1/layer2', 'packs/pack1/layer3'] as const
	const gainOf = (engine: AudioEngine, layer: string): number =>
		engine.getMusicStems().get(`packs/pack1/${layer}`)!.currentGain

	it('schedules every stem on one shared future instant, looping, at gain 0', async () => {
		const { engine, sources } = makeEngine()
		engine.startMusicStems(STEMS)
		await settle()

		expect(sources).toHaveLength(STEMS.length)
		// The fix in one assertion: a single `start` timestamp for every layer,
		// placed far enough ahead that the audio thread cannot miss it. Element
		// `play()` started each layer whenever its own buffer happened to fill,
		// which is what pulled the bed apart within the first seconds of a match.
		expect(new Set(sources.map((s) => s.startedAt))).toEqual(new Set([BED_LEAD_IN_SECONDS]))
		for (const source of sources) {
			expect(source.loop).toBe(true)
			expect(source.loopStart).toBe(0)
			expect(source.loopEnd).toBe(LOOP_SECONDS) // one loop length for all of them
			expect(source.buffer).not.toBeNull()
		}
		for (const stem of engine.getMusicStems().values()) expect(stem.currentGain).toBe(0)
	})

	it('reads position off the audio clock, so a loop wrap cannot shift it', async () => {
		const { engine, advance } = makeEngine()
		expect(engine.getMusicPosition()).toBeNull() // nothing running yet

		engine.startMusicStems(STEMS)
		await settle()
		expect(engine.getMusicPosition()).toBe(0) // scheduled, still inside the lead-in

		advance(10_000)
		const position = engine.getMusicPosition()!
		expect(position).toBeCloseTo(10 - BED_LEAD_IN_SECONDS, 6)

		// Exactly one loop later the bed is at the same place. Elements wrapped by
		// seeking, each with its own error, so this is where drift used to enter.
		advance(LOOP_SECONDS * 1000)
		expect(engine.getMusicPosition()).toBeCloseTo(position, 6)
	})

	it('snaps to the target mix when fadeMs is 0', async () => {
		const { engine } = makeEngine()
		engine.startMusicStems(STEMS)
		await settle()
		engine.setMusicMix({ 'packs/pack1/layer1': 1 }, { fadeMs: 0 })

		expect(gainOf(engine, 'layer1')).toBe(1)
		expect(gainOf(engine, 'layer3')).toBe(0)
	})

	it('crossfades stem gains on the audio clock without restarting any stem', async () => {
		const { engine, sources, advance } = makeEngine()
		engine.startMusicStems(STEMS)
		await settle()
		engine.setMusicMix({ 'packs/pack1/layer1': 1 }, { fadeMs: 0 })

		engine.setMusicMix({ 'packs/pack1/layer3': 1 }, { fadeMs: 1000 })

		// Halfway through, both are roughly equally loud (linear ramp).
		advance(500)
		expect(gainOf(engine, 'layer1')).toBeCloseTo(0.5, 6)
		expect(gainOf(engine, 'layer3')).toBeCloseTo(0.5, 6)
		// No stem was stopped or replaced — same sources, still running.
		expect(sources).toHaveLength(STEMS.length)
		expect(sources.some((s) => s.stopped)).toBe(false)

		advance(500)
		expect(gainOf(engine, 'layer1')).toBe(0)
		expect(gainOf(engine, 'layer3')).toBe(1)
	})

	it('re-targeting mid-fade continues smoothly from the current gain', async () => {
		const { engine, advance } = makeEngine()
		engine.startMusicStems(STEMS)
		await settle()
		engine.setMusicMix({ 'packs/pack1/layer1': 1 }, { fadeMs: 0 })

		// Start fading layer1 out toward 0, then reverse 40% of the way through.
		engine.setMusicMix({}, { fadeMs: 1000 })
		advance(400)
		const midGain = gainOf(engine, 'layer1')
		expect(midGain).toBeCloseTo(0.6, 6)

		engine.setMusicMix({ 'packs/pack1/layer1': 1 }, { fadeMs: 1000 })
		expect(gainOf(engine, 'layer1')).toBeCloseTo(midGain, 6) // no jump

		advance(1000)
		expect(gainOf(engine, 'layer1')).toBe(1)
	})

	it('stopMusicStems releases every source and clears the layer', async () => {
		const { engine, sources } = makeEngine()
		engine.startMusicStems(STEMS)
		await settle()
		engine.stopMusicStems()

		expect(sources.every((s) => s.stopped)).toBe(true)
		expect(engine.getMusicStems().size).toBe(0)
		expect(engine.getMusicPosition()).toBeNull()
	})

	it('master mute silences the bed output and leaves the arrangement intact', async () => {
		const { engine, gainNodes, advance } = makeEngine()
		engine.startMusicStems(STEMS)
		await settle()
		engine.setMusicMix({ 'packs/pack1/layer1': 1 }, { fadeMs: 0 })

		// The bed's master gain is the first node built with the context.
		const output = gainNodes[0].gain
		advance(20)
		expect(output.value).toBeGreaterThan(0)

		engine.setMasterMute(true)
		advance(20)
		expect(output.value).toBe(0)
		// Channel level and arrangement are separate now, so the mix is untouched.
		expect(gainOf(engine, 'layer1')).toBe(1)

		engine.setMasterMute(false)
		advance(20)
		expect(output.value).toBeGreaterThan(0)
	})

	it('reuses decoded buffers when the same pack restarts', async () => {
		const { engine, decodeCount } = makeEngine()
		engine.startMusicStems(STEMS)
		await settle()
		expect(decodeCount()).toBe(STEMS.length)

		engine.stopMusicStems()
		engine.startMusicStems(STEMS)
		await settle()

		expect(decodeCount()).toBe(STEMS.length) // no second decode
	})

	it('evicts the previous pack rather than holding both decoded', async () => {
		const { engine, decodeCount } = makeEngine()
		engine.startMusicStems(STEMS)
		await settle()

		engine.startMusicStems(['packs/pack2/layer1'])
		await settle()

		// One pack's worth of PCM resident at a time — the whole point of pruning,
		// since a decoded minute of 48kHz stereo is ~23MB.
		expect(engine.getMusicBedStatus()!.buffered).toBe(1)
		expect(decodeCount()).toBe(STEMS.length + 1)
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
