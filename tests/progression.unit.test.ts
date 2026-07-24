// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	pointsForResult,
	levelForPoints,
	POINTS,
	eloDelta,
	eloUpdatesFor1v1,
	ELO_K,
	DEFAULT_ELO,
} from '../src/lib/progression'

describe('pointsForResult', () => {
	it('awards the configured points per outcome', () => {
		expect(pointsForResult('win')).toBe(POINTS.win)
		expect(pointsForResult('draw')).toBe(POINTS.draw)
		expect(pointsForResult('loss')).toBe(POINTS.loss)
	})

	it('ranks a win above a draw above a loss', () => {
		expect(pointsForResult('win')).toBeGreaterThan(pointsForResult('draw'))
		expect(pointsForResult('draw')).toBeGreaterThan(pointsForResult('loss'))
	})
})

describe('levelForPoints', () => {
	it('floors at level 1 for zero or negative totals', () => {
		expect(levelForPoints(0)).toBe(1)
		expect(levelForPoints(-50)).toBe(1)
	})

	it('climbs one level per 100 points', () => {
		expect(levelForPoints(99)).toBe(1)
		expect(levelForPoints(100)).toBe(2)
		expect(levelForPoints(199)).toBe(2)
		expect(levelForPoints(250)).toBe(3)
	})

	it('treats non-finite input as level 1', () => {
		expect(levelForPoints(Number.NaN)).toBe(1)
		expect(levelForPoints(Number.POSITIVE_INFINITY)).toBe(1)
	})
})

describe('eloDelta', () => {
	it('awards half of K for a win between equals', () => {
		expect(eloDelta(DEFAULT_ELO, DEFAULT_ELO, 1)).toBe(ELO_K / 2)
		expect(eloDelta(DEFAULT_ELO, DEFAULT_ELO, 0)).toBe(-ELO_K / 2)
	})

	it('is zero for a draw between equals', () => {
		expect(eloDelta(DEFAULT_ELO, DEFAULT_ELO, 0.5)).toBe(0)
	})

	it('pays an upset win more than an expected win', () => {
		const upset = eloDelta(1000, 1400, 1)
		const expected = eloDelta(1400, 1000, 1)
		expect(upset).toBeGreaterThan(expected)
		expect(upset).toBeGreaterThan(ELO_K / 2)
		expect(expected).toBeLessThan(ELO_K / 2)
	})

	it('costs an upset loss more than an expected loss', () => {
		const favoriteLoss = eloDelta(1400, 1000, 0)
		const underdogLoss = eloDelta(1000, 1400, 0)
		expect(favoriteLoss).toBeLessThan(underdogLoss)
	})

	it('drifts the underdog up on a draw', () => {
		expect(eloDelta(1000, 1400, 0.5)).toBeGreaterThan(0)
		expect(eloDelta(1400, 1000, 0.5)).toBeLessThan(0)
	})

	it('never moves more than K in one game', () => {
		expect(eloDelta(0, 3000, 1)).toBeLessThanOrEqual(ELO_K)
		expect(eloDelta(3000, 0, 0)).toBeGreaterThanOrEqual(-ELO_K)
	})
})

describe('eloUpdatesFor1v1', () => {
	it('is exactly zero-sum for every score', () => {
		for (const score of [0, 0.5, 1] as const) {
			const [a, b] = eloUpdatesFor1v1(1234, 1187, score)
			expect(a.delta + b.delta).toBe(0)
		}
	})

	it("carries each side's prior rating as `before`", () => {
		const [a, b] = eloUpdatesFor1v1(1300, 1100, 1)
		expect(a.before).toBe(1300)
		expect(b.before).toBe(1100)
	})

	it('matches eloDelta for side A and negates it for side B', () => {
		const [a, b] = eloUpdatesFor1v1(1000, 1400, 1)
		expect(a.delta).toBe(eloDelta(1000, 1400, 1))
		expect(b.delta).toBe(-a.delta)
	})
})
