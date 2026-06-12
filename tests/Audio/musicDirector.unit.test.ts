// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writable } from 'svelte/store'
import {
	MUSIC_STEMS,
	musicMixForState,
	stingForState,
	MusicDirector,
	type MusicState,
	type MusicStemId,
	type MusicStingId,
	type MusicTrackId,
} from '../../src/lib/Audio/musicDirector'
import type { MusicMix, MusicMixOptions, PlaySingleOptions } from '../../src/lib/Audio/audioEngine'
import type { GameState } from '../../src/lib/Engine/gameState'

// ── Pure mappings ───────────────────────────────────────────────────────────

const base = (overrides: Partial<MusicState> = {}): MusicState => ({
	phase: 'playing',
	currentTeam: 0,
	...overrides,
})

/** The stem the mix raises to full gain (or `null` if no stem is active). */
function activeStem(mix: MusicMix): string | null {
	for (const [name, gain] of Object.entries(mix)) if (gain >= 1) return name
	return null
}

describe('musicMixForState (pure)', () => {
	it('raises the local player stem on the local turn', () => {
		expect(activeStem(musicMixForState(base({ currentTeam: 0 }), 0))).toBe('game/player')
	})

	it('raises the enemy stem on an opponent turn (2 teams)', () => {
		expect(activeStem(musicMixForState(base({ currentTeam: 1 }), 0))).toBe('game/enemy')
	})

	it('raises the thinking stem while an opponent CPU computes', () => {
		expect(activeStem(musicMixForState(base({ currentTeam: 1, cpuThinking: true }), 0))).toBe(
			'game/thinking'
		)
	})

	it('returns to the enemy stem once the CPU has acted', () => {
		expect(activeStem(musicMixForState(base({ currentTeam: 1, cpuThinking: false }), 0))).toBe(
			'game/enemy'
		)
	})

	it('raises the ally stem for a non-local allied team (teams > 2)', () => {
		const state = base({ currentTeam: 1, allies: [1] })
		expect(activeStem(musicMixForState(state, 0))).toBe('game/ally')
	})

	it('raises the enemy stem for a non-local, non-allied team (teams > 2)', () => {
		const state = base({ currentTeam: 2, allies: [1] })
		expect(activeStem(musicMixForState(state, 0))).toBe('game/enemy')
	})

	it('raises the intro stem when intro is set, over any turn theme', () => {
		expect(activeStem(musicMixForState(base({ currentTeam: 0, intro: true }), 0))).toBe(
			'game/intro'
		)
		expect(activeStem(musicMixForState(base({ currentTeam: 1, intro: true }), 0))).toBe(
			'game/intro'
		)
	})

	it('raises the inactive stem on inactivity, over the local turn theme', () => {
		expect(activeStem(musicMixForState(base({ currentTeam: 0, inactive: true }), 0))).toBe(
			'game/inactive'
		)
	})

	it('silences every stem on game over (the sting plays separately)', () => {
		expect(musicMixForState(base({ phase: 'gameOver', winner: 0 }), 0)).toEqual({})
		expect(musicMixForState(base({ phase: 'gameOver', winner: 1 }), 0)).toEqual({})
	})
})

describe('stingForState (pure)', () => {
	it('returns no sting while the match is in progress', () => {
		expect(stingForState(base({ currentTeam: 0 }), 0)).toBeNull()
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

const recorder = () => {
	const stemStarts: MusicStemId[][] = []
	const mixes: MusicMix[] = []
	const stings: StingCall[] = []
	let stopStems = 0
	let stopSting = 0
	return {
		stemStarts,
		mixes,
		stings,
		stopStemsCount: () => stopStems,
		stopStingCount: () => stopSting,
		startMusicStems: (names: readonly MusicStemId[]) => {
			stemStarts.push([...names])
		},
		setMusicMix: (mix: MusicMix, _opts?: MusicMixOptions) => {
			mixes.push(mix)
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

describe('MusicDirector (subscription shell)', () => {
	it('starts every looping stem in lockstep on start()', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const director = new MusicDirector({ localTeam: 0, store, ...rec })

		director.start()
		expect(rec.stemStarts).toHaveLength(1)
		expect(rec.stemStarts[0]).toEqual([...MUSIC_STEMS])
		director.stop()
	})

	it('mixes up the intro stem at turn 1, then crossfades to the turn theme', () => {
		const store = writable(makeGameState({ turnNumber: 1, currentTeam: 0 }))
		const rec = recorder()
		let introCb: (() => void) | null = null

		const director = new MusicDirector({
			localTeam: 0,
			store,
			...rec,
			setTimer: (fn) => {
				introCb = fn
				return 1 as unknown as ReturnType<typeof setTimeout>
			},
			clearTimer: () => {},
		})

		director.start()
		expect(rec.mixes.at(-1)).toEqual({ 'game/intro': 1 })

		introCb!()
		expect(rec.mixes.at(-1)).toEqual({ 'game/player': 1 })

		director.stop()
	})

	it('crossfades stem mixes on turn changes — never re-starting stems', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const director = new MusicDirector({ localTeam: 0, store, ...rec })

		director.start()
		store.set(makeGameState({ currentTeam: 1 }))
		store.set(makeGameState({ currentTeam: 1 })) // store update, same desired mix
		store.set(makeGameState({ currentTeam: 0 }))

		const stems = rec.mixes.map(activeStem)
		expect(stems).toEqual(['game/player', 'game/enemy', 'game/enemy', 'game/player'])

		// Stems are started exactly once — transitions never re-initialise them.
		expect(rec.stemStarts).toHaveLength(1)
		director.stop()
	})

	it('crossfades to thinking for a CPU opponent then back to the enemy stem', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			isCpuTeam: () => true,
			...rec,
		})

		director.start()
		store.set(makeGameState({ currentTeam: 1 })) // CPU turn, nothing acted → thinking
		store.set(makeGameState({ currentTeam: 1, actedTiles: new Set([5]) })) // CPU acted

		expect(rec.mixes.map(activeStem)).toEqual(['game/player', 'game/thinking', 'game/enemy'])
		director.stop()
	})

	it('silences every stem on game over and triggers the win sting', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const director = new MusicDirector({ localTeam: 0, store, ...rec })

		director.start()
		store.set(makeGameState({ phase: 'gameOver', winner: 0 }))

		expect(rec.mixes.at(-1)).toEqual({})
		const last = rec.stings.at(-1) as StingCall
		expect(last).toEqual({ track: 'game/win' as MusicStingId, loop: false })
		director.stop()
	})

	it('plays the lose sting for the losing local player', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const director = new MusicDirector({ localTeam: 0, store, ...rec })

		director.start()
		store.set(makeGameState({ phase: 'gameOver', winner: 1 }))

		expect(rec.stings.at(-1)).toEqual({ track: 'game/lose', loop: false })
		director.stop()
	})

	it('tears down stems and sting channel on stop()', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const director = new MusicDirector({ localTeam: 0, store, ...rec })

		director.start()
		const mixesBefore = rec.mixes.length
		director.stop()
		expect(rec.stopStemsCount()).toBeGreaterThan(0)
		expect(rec.stopStingCount()).toBeGreaterThan(0)

		// further store changes are ignored once stopped
		store.set(makeGameState({ currentTeam: 1 }))
		expect(rec.mixes.length).toBe(mixesBefore)
	})
})
