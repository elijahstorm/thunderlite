// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
	clampAsyncTimeout,
	formatAgo,
	formatTimeLeft,
	formatTurnTimeout,
	turnUrgency,
	ASYNC_TURN_TIMEOUT_MIN_MS,
	ASYNC_TURN_TIMEOUT_MAX_MS,
} from '../../src/lib/Game/asyncConfig'

/**
 * The correspondence clock as the player reads it. These strings and tiers are
 * the whole "this game needs you" signal on the games hub and in the turn
 * emails, so they're pinned here rather than left to the eye.
 */
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('formatTimeLeft', () => {
	it('drops a zero remainder instead of padding it', () => {
		// '19h 0m' read like a broken clock; the remainder only earns its place
		// when it is non-zero.
		expect(formatTimeLeft(19 * HOUR)).toBe('19h')
		expect(formatTimeLeft(2 * DAY)).toBe('2d')
	})

	it('keeps a non-zero remainder', () => {
		expect(formatTimeLeft(2 * DAY + 14 * HOUR)).toBe('2d 14h')
		expect(formatTimeLeft(2 * HOUR + 20 * 60_000)).toBe('2h 20m')
		expect(formatTimeLeft(4 * 60_000)).toBe('4m')
	})

	it('never reads negative for a clock already gone', () => {
		expect(formatTimeLeft(-5 * HOUR)).toBe('0m')
	})
})

describe('turnUrgency', () => {
	it('tiers a clock by how much trouble it is in', () => {
		expect(turnUrgency(3 * DAY)).toBe('calm')
		expect(turnUrgency(19 * HOUR)).toBe('soon')
		expect(turnUrgency(2 * HOUR)).toBe('critical')
		expect(turnUrgency(-1)).toBe('expired')
	})

	it('treats an absent deadline as nothing to shout about', () => {
		// An unstarted room has no deadline; it must not render as urgent.
		expect(turnUrgency(null)).toBe('calm')
	})

	it('puts the boundaries on the calmer side', () => {
		expect(turnUrgency(6 * HOUR)).toBe('soon')
		expect(turnUrgency(24 * HOUR)).toBe('calm')
	})
})

describe('formatTurnTimeout', () => {
	it('matches the presets a host picks from', () => {
		expect(formatTurnTimeout(12 * HOUR)).toBe('12 hours')
		expect(formatTurnTimeout(DAY)).toBe('1 day')
		expect(formatTurnTimeout(3 * DAY)).toBe('3 days')
	})
})

describe('clampAsyncTimeout', () => {
	it('refuses a hostile client a ten-second or ten-year clock', () => {
		expect(clampAsyncTimeout(1000)).toBe(ASYNC_TURN_TIMEOUT_MIN_MS)
		expect(clampAsyncTimeout(999 * DAY)).toBe(ASYNC_TURN_TIMEOUT_MAX_MS)
		expect(clampAsyncTimeout('nonsense')).toBe(3 * DAY)
	})
})

describe('formatAgo', () => {
	it('describes when the turn last changed hands', () => {
		const now = Date.now()
		expect(formatAgo(now - 30_000)).toBe('a moment ago')
		expect(formatAgo(now - 40 * 60_000)).toBe('40 minutes ago')
		expect(formatAgo(now - 5 * HOUR)).toBe('5 hours ago')
		expect(formatAgo(now - 26 * HOUR)).toBe('yesterday')
		expect(formatAgo(now - 3 * DAY)).toBe('3 days ago')
	})

	it('has nothing to say about a game that never moved', () => {
		expect(formatAgo(null)).toBeNull()
	})
})
