// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
	onMatchEnd,
	emitMatchEnd,
	resetMatchEnd,
	matchEnded,
	lastMatchResult,
	buildMatchResult,
	type MatchResult,
} from '../../src/lib/Engine/matchEnd'
import type { GameState } from '../../src/lib/Engine/gameState'

const makeState = (overrides: Partial<GameState> = {}): GameState => ({
	players: [
		{ team: 0, money: 0, hasLost: true },
		{ team: 1, money: 0, hasLost: false },
	],
	currentTeam: 1,
	turnNumber: 7,
	actedTiles: new Set<number>(),
	phase: 'gameOver',
	winner: 1,
	...overrides,
})

const result = (overrides: Partial<MatchResult> = {}): MatchResult => ({
	mode: 'hotseat',
	winner: 1,
	players: [
		{ team: 0, outcome: 'loss', isLocal: true, isCpu: false },
		{ team: 1, outcome: 'win', isLocal: false, isCpu: true },
	],
	turns: 7,
	endedAt: 123,
	...overrides,
})

describe('emitMatchEnd / onMatchEnd', () => {
	beforeEach(() => {
		resetMatchEnd()
	})

	it('fires registered handlers once with the result payload', () => {
		const spy = vi.fn()
		onMatchEnd(spy)

		const r = result()
		emitMatchEnd(r)

		expect(spy).toHaveBeenCalledTimes(1)
		expect(spy).toHaveBeenCalledWith(r)
	})

	it('delivers the same result to two handlers; unsubscribing one stops only that one', () => {
		const a = vi.fn()
		const b = vi.fn()
		const offA = onMatchEnd(a)
		onMatchEnd(b)

		const first = result({ endedAt: 1 })
		emitMatchEnd(first)
		expect(a).toHaveBeenCalledTimes(1)
		expect(b).toHaveBeenCalledTimes(1)
		expect(a.mock.calls[0][0]).toBe(b.mock.calls[0][0])

		// Unsubscribe a, start a new match, emit again.
		offA()
		resetMatchEnd()
		const second = result({ endedAt: 2 })
		emitMatchEnd(second)

		expect(a).toHaveBeenCalledTimes(1) // unchanged
		expect(b).toHaveBeenCalledTimes(2)
		expect(b.mock.calls[1][0]).toBe(second)
	})

	it('is idempotent per match: re-evaluating after the match ended does not fire a second event', () => {
		const spy = vi.fn()
		onMatchEnd(spy)

		emitMatchEnd(result({ endedAt: 1 }))
		emitMatchEnd(result({ endedAt: 2 }))
		emitMatchEnd(result({ endedAt: 3 }))

		expect(spy).toHaveBeenCalledTimes(1)
		expect(spy.mock.calls[0][0].endedAt).toBe(1)
		expect(matchEnded()).toBe(true)
	})

	it('re-arms after resetMatchEnd for a fresh match', () => {
		const spy = vi.fn()
		onMatchEnd(spy)

		emitMatchEnd(result())
		expect(spy).toHaveBeenCalledTimes(1)

		resetMatchEnd()
		expect(matchEnded()).toBe(false)
		expect(lastMatchResult()).toBeNull()

		emitMatchEnd(result())
		expect(spy).toHaveBeenCalledTimes(2)
	})

	it('exposes the last result for late subscribers', () => {
		expect(lastMatchResult()).toBeNull()
		const r = result()
		emitMatchEnd(r)
		expect(lastMatchResult()).toBe(r)
	})
})

describe('buildMatchResult', () => {
	it('builds a terminal result with correct winner, per-player outcome, mode, and turns', () => {
		const r = buildMatchResult({
			state: makeState(),
			winner: 1,
			mode: 'hotseat',
			localTeam: 0,
			isCpuTeam: (team) => team === 1,
			now: () => 999,
		})

		expect(r.mode).toBe('hotseat')
		expect(r.winner).toBe(1)
		expect(r.turns).toBe(7)
		expect(r.endedAt).toBe(999)
		expect(r.players).toEqual([
			{ team: 0, userAuth: undefined, outcome: 'loss', isLocal: true, isCpu: false },
			{ team: 1, userAuth: undefined, outcome: 'win', isLocal: false, isCpu: true },
		])
		// stats is omitted unless supplied (J2 populates it).
		expect('stats' in r).toBe(false)
	})

	it('emits winner null and every player outcome "draw" when no team can win', () => {
		const r = buildMatchResult({
			state: makeState({ winner: undefined }),
			winner: null,
			mode: 'online',
			localTeam: 0,
		})

		expect(r.winner).toBeNull()
		expect(r.players.map((p) => p.outcome)).toEqual(['draw', 'draw'])
	})

	it('carries optional fields (sessionId, campaignLevelId, stats) through untouched', () => {
		const stats = [{ team: 0, kills: 3 }]
		const r = buildMatchResult({
			state: makeState(),
			winner: 1,
			mode: 'campaign',
			localTeam: 0,
			sessionId: 'sess-1',
			campaignLevelId: 'level-3',
			stats,
		})

		expect(r.sessionId).toBe('sess-1')
		expect(r.campaignLevelId).toBe('level-3')
		expect(r.stats).toBe(stats)
	})

	it('end-to-end: a fake terminal state drives a single dispatch with the right shape', () => {
		resetMatchEnd()
		const spy = vi.fn()
		onMatchEnd(spy)

		const r = buildMatchResult({
			state: makeState(),
			winner: 1,
			mode: 'hotseat',
			localTeam: 0,
			isCpuTeam: (team) => team === 1,
			now: () => 42,
		})
		emitMatchEnd(r)
		emitMatchEnd(r) // re-evaluation: must not double-fire

		expect(spy).toHaveBeenCalledTimes(1)
		const payload: MatchResult = spy.mock.calls[0][0]
		expect(payload.winner).toBe(1)
		expect(payload.turns).toBe(7)
		expect(payload.mode).toBe('hotseat')
		expect(payload.players.find((p) => p.team === 1)?.outcome).toBe('win')
		expect(payload.players.find((p) => p.team === 0)?.outcome).toBe('loss')
	})
})
