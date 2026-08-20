// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writable } from 'svelte/store'
import {
	MUSIC_STEMS,
	moodForState,
	musicMixForState,
	stingForState,
	MusicDirector,
	type MusicState,
	type MusicTrackId,
	type PhraseSource,
} from '../../src/lib/Audio/musicDirector'
import { FATIGUE_PHRASES, MUSIC_LAYERS, layerTrackId } from '../../src/lib/Audio/musicVariation'
import type { MusicMix, MusicMixOptions, PlaySingleOptions } from '../../src/lib/Audio/audioEngine'
import type { GameState } from '../../src/lib/Engine/gameState'

// ── Pure mappings ───────────────────────────────────────────────────────────

const base = (overrides: Partial<MusicState> = {}): MusicState => ({
	phase: 'playing',
	currentTeam: 0,
	...overrides,
})

describe('MUSIC_STEMS', () => {
	it('is exactly the bed layers, so the engine loads nothing else', () => {
		expect(MUSIC_STEMS).toEqual(MUSIC_LAYERS.map(layerTrackId))
	})
})

describe('moodForState (pure)', () => {
	it('plays the player mood on the local turn', () => {
		expect(moodForState(base({ currentTeam: 0 }), 0)).toBe('player')
	})

	it('plays the enemy mood on an opponent turn (2 teams)', () => {
		expect(moodForState(base({ currentTeam: 1 }), 0)).toBe('enemy')
	})

	it('plays the thinking mood while an opponent CPU computes', () => {
		expect(moodForState(base({ currentTeam: 1, cpuThinking: true }), 0)).toBe('thinking')
	})

	it('returns to the enemy mood once the CPU has acted', () => {
		expect(moodForState(base({ currentTeam: 1, cpuThinking: false }), 0)).toBe('enemy')
	})

	it('plays the ally mood for a non-local allied team (teams > 2)', () => {
		expect(moodForState(base({ currentTeam: 1, allies: [1] }), 0)).toBe('ally')
	})

	it('plays the enemy mood for a non-local, non-allied team (teams > 2)', () => {
		expect(moodForState(base({ currentTeam: 2, allies: [1] }), 0)).toBe('enemy')
	})

	it('rests the bed under the intro, over any turn mood', () => {
		expect(moodForState(base({ currentTeam: 0, intro: true }), 0)).toBe('rest')
		expect(moodForState(base({ currentTeam: 1, intro: true }), 0)).toBe('rest')
	})

	it('lets the hurry warning outrank even the local turn', () => {
		expect(moodForState(base({ currentTeam: 0, inactive: true }), 0)).toBe('hurry')
	})

	it('rests on a caller-declared lull', () => {
		expect(moodForState(base({ currentTeam: 0, resting: true }), 0)).toBe('rest')
	})

	it('lets the hurry warning outrank a lull', () => {
		expect(moodForState(base({ resting: true, inactive: true }), 0)).toBe('hurry')
	})

	it('goes silent on game over so the sting owns the moment', () => {
		expect(moodForState(base({ phase: 'gameOver', winner: 0 }), 0)).toBe('silent')
		expect(musicMixForState(base({ phase: 'gameOver', winner: 1 }), 0)).toEqual({})
	})
})

describe('stingForState (pure)', () => {
	it('returns no sting while the match is quietly in progress', () => {
		expect(stingForState(base({ currentTeam: 0 }), 0)).toBeNull()
	})

	it('plays the intro sting over the opening', () => {
		expect(stingForState(base({ intro: true }), 0)).toBe('game/intro')
	})

	it('plays the win sting for the winner on game over', () => {
		expect(stingForState(base({ phase: 'gameOver', winner: 0 }), 0)).toBe('game/win')
	})

	it('plays the lose sting for the loser on game over', () => {
		expect(stingForState(base({ phase: 'gameOver', winner: 1 }), 0)).toBe('game/lose')
	})

	it('plays the lose sting on a draw (no winner)', () => {
		expect(stingForState(base({ phase: 'gameOver', winner: undefined }), 0)).toBe('game/lose')
	})

	it('lets game over outrank a still-set intro flag', () => {
		expect(stingForState(base({ phase: 'gameOver', winner: 0, intro: true }), 0)).toBe('game/win')
	})
})

// ── Side-effecting director ──────────────────────────────────────────────────

const makeGameState = (overrides: Partial<GameState> = {}): GameState => ({
	players: [
		{ team: 0, money: 0, hasLost: false },
		{ team: 1, money: 0, hasLost: false },
	],
	currentTeam: 0,
	turnNumber: 2, // skip the intro sting unless a test asks for turn 1
	actedTiles: new Set<number>(),
	phase: 'playing',
	...overrides,
})

type StingCall = { track: MusicTrackId; loop: boolean }
type MixCall = { mix: MusicMix; fadeMs: number | undefined }

const recorder = () => {
	const stemStarts: string[][] = []
	const mixCalls: MixCall[] = []
	const stings: StingCall[] = []
	let stopStems = 0
	let stopSting = 0
	return {
		stemStarts,
		mixCalls,
		stings,
		mixes: () => mixCalls.map((c) => c.mix),
		stopStemsCount: () => stopStems,
		stopStingCount: () => stopSting,
		startMusicStems: (names: readonly string[]) => {
			stemStarts.push([...names])
		},
		setMusicMix: (mix: MusicMix, opts?: MusicMixOptions) => {
			mixCalls.push({ mix, fadeMs: opts?.fadeMs })
		},
		stopMusicStems: () => {
			stopStems++
		},
		playMusic: (track: MusicTrackId, opts?: PlaySingleOptions) => {
			stings.push({ track, loop: opts?.loop ?? true })
		},
		stopMusic: () => {
			stopSting++
		},
	}
}

/** A phrase source the test advances by hand. */
const fakePhrases = () => {
	let emit: ((phrase: number) => void) | null = null
	let phrase = 0
	let started = 0
	let stopped = 0
	let resets = 0
	return {
		startedCount: () => started,
		stoppedCount: () => stopped,
		resetCount: () => resets,
		/** Advance the clock `n` phrases and notify the director each time. */
		advance(n = 1) {
			for (let i = 0; i < n; i++) emit?.(++phrase)
		},
		source(onPhrase: (phrase: number) => void): PhraseSource {
			emit = onPhrase
			return {
				start: () => {
					started++
				},
				stop: () => {
					stopped++
				},
				reset: () => {
					resets++
					phrase = 0
				},
				current: () => phrase,
			}
		},
	}
}

/** Distinct mixes in call order, as sorted layer-id lists. */
const shapes = (mixes: MusicMix[]) => mixes.map((m) => Object.keys(m).sort().join('+'))

describe('MusicDirector (subscription shell)', () => {
	it('starts every bed layer in lockstep on start()', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const clock = fakePhrases()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
		})

		director.start()
		expect(rec.stemStarts).toHaveLength(1)
		expect(rec.stemStarts[0]).toEqual([...MUSIC_STEMS])
		expect(clock.startedCount()).toBe(1)
		director.stop()
	})

	it('plays the intro sting at turn 1 and rests the bed beneath it', () => {
		const store = writable(makeGameState({ turnNumber: 1, currentTeam: 0 }))
		const rec = recorder()
		const clock = fakePhrases()
		let introCb: (() => void) | null = null

		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
			setTimer: (fn) => {
				introCb = fn
				return 1 as unknown as ReturnType<typeof setTimeout>
			},
			clearTimer: () => {},
		})

		director.start()
		expect(director.currentMood()).toBe('rest')
		expect(rec.stings).toEqual([{ track: 'game/intro', loop: false }])

		introCb!()
		expect(director.currentMood()).toBe('player')
		director.stop()
	})

	it('re-arranges on turn changes without ever restarting a layer', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const clock = fakePhrases()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
		})

		director.start()
		expect(director.currentMood()).toBe('player')
		store.set(makeGameState({ currentTeam: 1 }))
		expect(director.currentMood()).toBe('enemy')
		store.set(makeGameState({ currentTeam: 0 }))
		expect(director.currentMood()).toBe('player')

		// Layers are started exactly once — a mood change is only ever a gain move.
		expect(rec.stemStarts).toHaveLength(1)
		director.stop()
	})

	it('drops a store update that would not change what you hear', () => {
		// The old director re-crossfaded on every store tick. A no-op fade is
		// audible when it interrupts one already in flight.
		const store = writable(makeGameState({ currentTeam: 1 }))
		const rec = recorder()
		const clock = fakePhrases()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
		})

		director.start()
		const before = rec.mixCalls.length
		store.set(makeGameState({ currentTeam: 1 }))
		store.set(makeGameState({ currentTeam: 1 }))
		expect(rec.mixCalls.length).toBe(before)
		director.stop()
	})

	it('re-arranges the same mood as the phrase clock advances', () => {
		// The whole point: sitting in one mood must not sound identical forever.
		const store = writable(makeGameState({ currentTeam: 1 }))
		const rec = recorder()
		const clock = fakePhrases()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
			phrasesPerVariation: 1,
			seed: 5,
		})

		director.start()
		clock.advance(8)
		expect(director.currentMood()).toBe('enemy')
		expect(new Set(shapes(rec.mixes())).size).toBeGreaterThan(1)
		director.stop()
	})

	it('fades a mood change quickly and a re-arrangement slowly', () => {
		// A turn flip is news. A re-arrangement inside one mood should slide under
		// the player's attention instead of announcing itself.
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const clock = fakePhrases()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
			phrasesPerVariation: 1,
			fadeMs: 800,
			variationFadeMs: 2500,
			seed: 3,
		})

		director.start()
		expect(rec.mixCalls.at(-1)!.fadeMs).toBe(800) // initial mood

		const beforeVariation = rec.mixCalls.length
		clock.advance(4)
		const variationFades = rec.mixCalls.slice(beforeVariation).map((c) => c.fadeMs)
		expect(variationFades.length).toBeGreaterThan(0)
		expect(new Set(variationFades)).toEqual(new Set([2500]))

		store.set(makeGameState({ currentTeam: 1 }))
		expect(rec.mixCalls.at(-1)!.fadeMs).toBe(800)
		director.stop()
	})

	it('thins the bed out when one mood grinds on', () => {
		// A long CPU turn should sag, so that your own turn coming back lands.
		const store = writable(makeGameState({ currentTeam: 1 }))
		const rec = recorder()
		const clock = fakePhrases()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
			phrasesPerVariation: 1,
			seed: 2,
		})

		director.start()
		const opening = rec.mixCalls.at(-1)!.mix
		clock.advance(FATIGUE_PHRASES * 3)
		const grinding = rec.mixCalls.at(-1)!.mix

		expect(Math.max(...Object.values(grinding))).toBeLessThan(Math.max(...Object.values(opening)))
		director.stop()
	})

	it('brings a returning mood back at full strength', () => {
		// Dwell restarts on a mood change, so a mood does not inherit the fatigue
		// of its previous outing — otherwise the bed would only ever decay.
		const store = writable(makeGameState({ currentTeam: 1 }))
		const rec = recorder()
		const clock = fakePhrases()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
			phrasesPerVariation: 1,
			seed: 4,
		})

		director.start()
		clock.advance(FATIGUE_PHRASES * 3)
		const tired = Math.max(...Object.values(rec.mixCalls.at(-1)!.mix))

		store.set(makeGameState({ currentTeam: 0 })) // local turn: fresh mood
		store.set(makeGameState({ currentTeam: 1 })) // and back to the enemy
		const revived = Math.max(...Object.values(rec.mixCalls.at(-1)!.mix))

		expect(revived).toBeGreaterThan(tired)
		director.stop()
	})

	it('pulls the bed back on a declared lull and restores it after', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const clock = fakePhrases()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
		})

		director.start()
		const full = rec.mixCalls.at(-1)!.mix
		director.setResting(true)
		const resting = rec.mixCalls.at(-1)!.mix
		expect(Object.keys(resting).length).toBeLessThan(Object.keys(full).length)

		director.setResting(false)
		expect(director.currentMood()).toBe('player')
		director.stop()
	})

	it('opens the bed up on the hurry warning and keeps it open', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const clock = fakePhrases()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
			phrasesPerVariation: 1,
		})

		director.start()
		director.setInactive(true)
		expect(director.currentMood()).toBe('hurry')
		const urgent = Math.max(...Object.values(rec.mixCalls.at(-1)!.mix))

		// Fatigue must not fade out a warning.
		clock.advance(FATIGUE_PHRASES * 4)
		expect(Math.max(...Object.values(rec.mixCalls.at(-1)!.mix))).toBe(urgent)
		director.stop()
	})

	it('silences the bed and plays the sting on game over', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const clock = fakePhrases()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
		})

		director.start()
		store.set(makeGameState({ phase: 'gameOver', winner: 0 }))
		expect(rec.mixCalls.at(-1)!.mix).toEqual({})
		expect(rec.stings.at(-1)).toEqual({ track: 'game/win', loop: false })
		director.stop()
	})

	it('releases the store, the clock and the bed on stop()', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const clock = fakePhrases()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
		})

		director.start()
		director.stop()

		expect(rec.stopStemsCount()).toBe(1)
		expect(rec.stopStingCount()).toBe(1)
		expect(clock.stoppedCount()).toBe(1)

		const after = rec.mixCalls.length
		store.set(makeGameState({ currentTeam: 1 }))
		expect(rec.mixCalls.length).toBe(after)
		expect(director.currentMood()).toBeNull()
	})

	it('ignores a second start()', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const clock = fakePhrases()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			phraseSource: clock.source,
		})

		director.start()
		director.start()
		expect(rec.stemStarts).toHaveLength(1)
		expect(clock.startedCount()).toBe(1)
		director.stop()
	})
})
