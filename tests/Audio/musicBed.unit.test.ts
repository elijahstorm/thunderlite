// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	WebAudioMusicBed,
	BED_LEAD_IN_SECONDS,
	type AudioBufferLike,
	type AudioParamLike,
	type BedContextLike,
	type BufferSourceLike,
	type GainNodeLike,
} from '../../src/lib/Audio/musicBed'

/**
 * The bed's own edge cases — the asynchronous ones the engine tests cannot
 * reach, because they need a load that is still in flight when something else
 * happens to the bed.
 */

const LOOP_SECONDS = 48

class StubParam implements AudioParamLike {
	value = 0
	cancelScheduledValues(): void {}
	setValueAtTime(value: number): void {
		this.value = value
	}
	linearRampToValueAtTime(value: number): void {
		this.value = value
	}
}

class StubGain implements GainNodeLike {
	readonly gain = new StubParam()
	disconnected = false
	connect(): void {}
	disconnect(): void {
		this.disconnected = true
	}
}

class StubSource implements BufferSourceLike {
	buffer: AudioBufferLike | null = null
	loop = false
	loopStart = 0
	loopEnd = 0
	startedAt: number | null = null
	connect(): void {}
	disconnect(): void {}
	start(when = 0): void {
		this.startedAt = when
	}
	stop(): void {}
}

/** A promise whose resolution the test controls. */
function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function makeHarness() {
	const clock = { now: 0 }
	const sources: StubSource[] = []
	const gains: StubGain[] = []
	let resumes = 0

	const ctx: BedContextLike = {
		get currentTime() {
			return clock.now
		},
		state: 'suspended',
		destination: 'destination',
		createGain: () => {
			const gain = new StubGain()
			gains.push(gain)
			return gain
		},
		createBufferSource: () => {
			const source = new StubSource()
			sources.push(source)
			return source
		},
		decodeAudioData: async () => ({ duration: LOOP_SECONDS }),
		resume: async () => {
			resumes += 1
		},
	}

	return { ctx, clock, sources, gains, resumeCount: () => resumes }
}

const STEMS = [
	{ name: 'layer1', url: '/a.ogg' },
	{ name: 'layer2', url: '/b.ogg' },
]

describe('WebAudioMusicBed', () => {
	it('does not schedule a bed that was stopped while still loading', async () => {
		const h = makeHarness()
		const gate = deferred<ArrayBuffer>()
		const bed = new WebAudioMusicBed({
			createContext: () => h.ctx,
			fetchBytes: () => gate.promise,
		})

		bed.start(STEMS)
		bed.stop() // match ended, or the player switched packs
		gate.resolve(new ArrayBuffer(8))
		await settle()

		// A load landing after teardown must not resurrect the bed.
		expect(h.sources).toHaveLength(0)
		expect(bed.position()).toBeNull()
		expect(bed.status().scheduled).toBe(false)
	})

	it('restarting mid-load schedules only the newest layer set', async () => {
		const h = makeHarness()
		const first = deferred<ArrayBuffer>()
		let call = 0
		const bed = new WebAudioMusicBed({
			createContext: () => h.ctx,
			fetchBytes: () =>
				call++ < STEMS.length ? first.promise : Promise.resolve(new ArrayBuffer(8)),
		})

		bed.start(STEMS)
		bed.start([{ name: 'other', url: '/c.ogg' }])
		first.resolve(new ArrayBuffer(8)) // the abandoned load finally arrives
		await settle()

		expect(h.sources).toHaveLength(1)
		expect(bed.gains().has('other')).toBe(true)
	})

	it('refuses to run a partial bed when a layer fails to load', async () => {
		const h = makeHarness()
		const failures: string[] = []
		const bed = new WebAudioMusicBed({
			createContext: () => h.ctx,
			fetchBytes: (url) =>
				url === '/b.ogg' ? Promise.reject(new Error('404')) : Promise.resolve(new ArrayBuffer(8)),
			onError: (url) => failures.push(url),
		})

		bed.start(STEMS)
		await settle()

		// Half a composition in time is worse than none: the mix would be wrong
		// and the missing layer could never be brought in later.
		expect(h.sources).toHaveLength(0)
		expect(bed.status().ready).toBe(false)
		expect(failures).toEqual(['/b.ogg'])
	})

	it('schedules on one future instant and asks a suspended context to resume', async () => {
		const h = makeHarness()
		const bed = new WebAudioMusicBed({
			createContext: () => h.ctx,
			fetchBytes: async () => new ArrayBuffer(8),
		})

		h.clock.now = 7.5
		bed.start(STEMS)
		await settle()

		expect(h.resumeCount()).toBeGreaterThan(0)
		expect(new Set(h.sources.map((s) => s.startedAt))).toEqual(new Set([7.5 + BED_LEAD_IN_SECONDS]))
		expect(bed.position()).toBe(0) // inside the lead-in
		expect(bed.loopSeconds()).toBe(LOOP_SECONDS)
	})

	it('tolerates gain and position calls before anything is loaded', () => {
		const bed = new WebAudioMusicBed({
			createContext: () => makeHarness().ctx,
			fetchBytes: async () => new ArrayBuffer(8),
		})

		expect(() => bed.setGains(new Map([['layer1', 1]]), 800)).not.toThrow()
		expect(() => bed.setOutputGain(0.5)).not.toThrow()
		expect(bed.position()).toBeNull()
		expect(bed.loopSeconds()).toBeNull()
		expect(bed.status().contextState).toBe('none')
	})

	it('releases gain nodes on stop so a restart does not stack the graph', async () => {
		const h = makeHarness()
		const bed = new WebAudioMusicBed({
			createContext: () => h.ctx,
			fetchBytes: async () => new ArrayBuffer(8),
		})

		bed.start(STEMS)
		await settle()
		const stemGains = h.gains.slice(1) // gains[0] is the bed's master node
		bed.stop()

		expect(stemGains.every((g) => g.disconnected)).toBe(true)
		expect(bed.gains().size).toBe(0)
	})
})
