// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { pointsForResult, levelForPoints, POINTS } from '../src/lib/progression'

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
