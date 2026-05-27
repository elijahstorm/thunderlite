// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { writable } from 'svelte/store'
import {
	musicForState,
	MusicDirector,
	type MusicState,
	type MusicTrackId,
} from '../../src/lib/Audio/musicDirector'
import type { GameState } from '../../src/lib/Engine/gameState'

// ── Pure mapping ────────────────────────────────────────────────────────────

const base = (overrides: Partial<MusicState> = {}): MusicState => ({
	phase: 'playing',
	currentTeam: 0,
	...overrides,
})

describe('musicForState (pure)', () => {
	it('plays the local player theme on the local turn', () => {
		expect(musicForState(base({ currentTeam: 0 }), 0)).toBe('game/player')
	})

	it('plays the enemy theme on an opponent turn (2 teams)', () => {
		expect(musicForState(base({ currentTeam: 1 }), 0)).toBe('game/enemy')
	})

	it('plays the thinking theme while an opponent CPU computes', () => {
		expect(musicForState(base({ currentTeam: 1, cpuThinking: true }), 0)).toBe('game/thinking')
	})

	it('returns to the enemy theme once the CPU has acted', () => {
		// cpuThinking flips false after the CPU's first action.
		expect(musicForState(base({ currentTeam: 1, cpuThinking: false }), 0)).toBe('game/enemy')
	})

	it('plays the ally theme for a non-local allied team (teams > 2)', () => {
		const state = base({ currentTeam: 1, allies: [1] })
		expect(musicForState(state, 0)).toBe('game/ally')
	})

	it('plays the enemy theme for a non-local, non-allied team (teams > 2)', () => {
		const state = base({ currentTeam: 2, allies: [1] })
		expect(musicForState(state, 0)).toBe('game/enemy')
	})

	it('plays the intro sting when intro is set, over any turn theme', () => {
		expect(musicForState(base({ currentTeam: 0, intro: true }), 0)).toBe('game/intro')
		expect(musicForState(base({ currentTeam: 1, intro: true }), 0)).toBe('game/intro')
	})

	it('plays the hurry warning when inactive, over the local turn theme', () => {
		expect(musicForState(base({ currentTeam: 0, inactive: true }), 0)).toBe('game/inactive')
	})

	it('plays the win sting for the winner on game over', () => {
		const state = base({ phase: 'gameOver', winner: 0 })
		expect(musicForState(state, 0)).toBe('game/win')
	})

	it('plays the lose sting for the loser on game over', () => {
		const state = base({ phase: 'gameOver', winner: 1 })
		expect(musicForState(state, 0)).toBe('game/lose')
	})

	it('plays the lose sting on a draw (no winner)', () => {
		const state = base({ phase: 'gameOver', winner: undefined })
		expect(musicForState(state, 0)).toBe('game/lose')
	})

	it('terminal stings take precedence over the intro flag', () => {
		const state = base({ phase: 'gameOver', winner: 0, intro: true })
		expect(musicForState(state, 0)).toBe('game/win')
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

type Play = { track: MusicTrackId; loop: boolean }

const recorder = () => {
	const plays: Play[] = []
	let stopped = 0
	return {
		plays,
		stopCount: () => stopped,
		playMusic: (track: MusicTrackId, opts?: { loop?: boolean }) =>
			plays.push({ track, loop: opts?.loop ?? true }),
		stopMusic: () => {
			stopped++
		},
	}
}

describe('MusicDirector (subscription shell)', () => {
	it('plays the intro sting then settles into the turn theme', () => {
		const store = writable(makeGameState({ turnNumber: 1, currentTeam: 0 }))
		const rec = recorder()
		let introCb: (() => void) | null = null

		const director = new MusicDirector({
			localTeam: 0,
			store,
			playMusic: rec.playMusic,
			stopMusic: rec.stopMusic,
			setTimer: (fn) => {
				introCb = fn
				return 1 as unknown as ReturnType<typeof setTimeout>
			},
			clearTimer: () => {},
		})

		director.start()
		expect(rec.plays.map((p) => p.track)).toEqual(['game/intro'])

		introCb?.() // intro elapses
		expect(rec.plays.map((p) => p.track)).toEqual(['game/intro', 'game/player'])

		director.stop()
	})

	it('switches themes on turn changes without restacking a track', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const director = new MusicDirector({ localTeam: 0, store, ...rec })

		director.start()
		// rapid-fire turn flips
		store.set(makeGameState({ currentTeam: 1 }))
		store.set(makeGameState({ currentTeam: 1 })) // no-op repeat
		store.set(makeGameState({ currentTeam: 0 }))

		expect(rec.plays.map((p) => p.track)).toEqual(['game/player', 'game/enemy', 'game/player'])

		director.stop()
	})

	it('plays thinking for a CPU opponent until it acts, then the enemy theme', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const director = new MusicDirector({
			localTeam: 0,
			store,
			isCpuTeam: () => true,
			playMusic: rec.playMusic,
			stopMusic: rec.stopMusic,
		})

		director.start()
		store.set(makeGameState({ currentTeam: 1 })) // CPU turn, nothing acted → thinking
		store.set(makeGameState({ currentTeam: 1, actedTiles: new Set([5]) })) // CPU acted

		expect(rec.plays.map((p) => p.track)).toEqual([
			'game/player',
			'game/thinking',
			'game/enemy',
		])

		director.stop()
	})

	it('plays the non-looping win sting for the winner on game over', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const director = new MusicDirector({ localTeam: 0, store, ...rec })

		director.start()
		store.set(makeGameState({ phase: 'gameOver', winner: 0 }))

		const last = rec.plays[rec.plays.length - 1]
		expect(last).toEqual({ track: 'game/win', loop: false })

		director.stop()
	})

	it('plays the non-looping lose sting for the loser on game over', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const director = new MusicDirector({ localTeam: 0, store, ...rec })

		director.start()
		store.set(makeGameState({ phase: 'gameOver', winner: 1 }))

		const last = rec.plays[rec.plays.length - 1]
		expect(last).toEqual({ track: 'game/lose', loop: false })

		director.stop()
	})

	it('stops music and unsubscribes on stop()', () => {
		const store = writable(makeGameState({ currentTeam: 0 }))
		const rec = recorder()
		const director = new MusicDirector({ localTeam: 0, store, ...rec })

		director.start()
		const playsBefore = rec.plays.length
		director.stop()
		expect(rec.stopCount()).toBeGreaterThan(0)

		// further store changes are ignored once stopped
		store.set(makeGameState({ currentTeam: 1 }))
		expect(rec.plays.length).toBe(playsBefore)
	})
})
