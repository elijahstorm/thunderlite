// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeStats, emptyStats, type MatchPlayerRow } from '../../src/lib/Database/getUserStats'
import { pointsForResult } from '../../src/lib/progression'

const rows = (...outcomes: MatchPlayerRow['outcome'][]): MatchPlayerRow[] =>
	outcomes.map((outcome) => ({ outcome }))

describe('computeStats', () => {
	it('returns zeros (not an error) for a brand-new account with no matches', () => {
		expect(computeStats([])).toEqual(emptyStats())
	})

	it('aggregates games, wins, losses and draws', () => {
		const s = computeStats(rows('win', 'win', 'win', 'loss', 'draw'))
		expect(s.games).toBe(5)
		expect(s.wins).toBe(3)
		expect(s.losses).toBe(1)
		expect(s.draws).toBe(1)
	})

	it('computes win-rate as a rounded percentage of games', () => {
		expect(computeStats(rows('win', 'win', 'win', 'loss', 'draw')).winRate).toBe(60)
		// 1 of 3 → 33.33% → 33
		expect(computeStats(rows('win', 'loss', 'loss')).winRate).toBe(33)
		// no games → 0, never NaN
		expect(computeStats([]).winRate).toBe(0)
	})

	it('derives points and a level (>= 1) from outcomes', () => {
		const s = computeStats(rows('win', 'win'))
		expect(s.points).toBe(pointsForResult('win') * 2)
		expect(s.level).toBeGreaterThanOrEqual(1)
	})
})
