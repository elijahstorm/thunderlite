// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	composeEloHistory,
	emptyEloHistory,
	type EloHistoryMatchRow,
	type EloHistoryRow,
} from '../../src/lib/Database/getEloHistory'
import { composeRatings, type RatingRow } from '../../src/lib/Database/getPlayerRatings'

const matches: EloHistoryMatchRow[] = [
	{ id: 1, ended_at: '2026-07-01 10:00:00' },
	{ id: 2, ended_at: '2026-07-05 10:00:00' },
	{ id: 3, ended_at: null },
]

// Newest-first, the order the DB wrapper fetches them in.
const rows: EloHistoryRow[] = [
	{ id: 30, match_id: 3, outcome: 'loss', elo_before: 1224, elo_delta: -14 },
	{ id: 20, match_id: 2, outcome: 'draw', elo_before: 1224, elo_delta: 0 },
	{ id: 10, match_id: 1, outcome: 'win', elo_before: 1200, elo_delta: 24 },
]

describe('composeEloHistory', () => {
	it('builds an oldest-first curve seeded with the rating carried into the first match', () => {
		const history = composeEloHistory(rows, matches)

		expect(history.points.map((p) => p.elo)).toEqual([1200, 1224, 1224, 1210])
		expect(history.points[0]).toMatchObject({ matchId: null, delta: null, outcome: null })
		expect(history.points[1]).toMatchObject({ matchId: 1, delta: 24, outcome: 'win' })
		expect(history.points[3]).toMatchObject({ matchId: 3, delta: -14, outcome: 'loss' })
	})

	it('reports the current rating, the peak, and how many matches it covers', () => {
		const history = composeEloHistory(rows, matches)

		expect(history.current).toBe(1210)
		expect(history.peak).toBe(1224)
		expect(history.rated).toBe(3)
	})

	it('carries each match end date, and null when the match never recorded one', () => {
		const history = composeEloHistory(rows, matches)

		expect(history.points[1].at).toBe('2026-07-01 10:00:00')
		expect(history.points[3].at).toBe(null)
	})

	it('walks each row from its own elo_before rather than accumulating deltas', () => {
		// A gap in the ladder (a correction, or a rating the app did not settle):
		// the curve must follow the recorded `elo_before`, not 1200 + 24 + 0.
		const corrected: EloHistoryRow[] = [
			{ id: 10, match_id: 1, outcome: 'win', elo_before: 1200, elo_delta: 24 },
			{ id: 20, match_id: 2, outcome: 'win', elo_before: 1400, elo_delta: 10 },
		]

		expect(composeEloHistory(corrected, matches).points.map((p) => p.elo)).toEqual([
			1200, 1224, 1410,
		])
	})

	it('skips unrated rows and returns an empty history when none are rated', () => {
		const unrated: EloHistoryRow[] = [
			{ id: 10, match_id: 1, outcome: 'win', elo_before: null, elo_delta: null },
		]

		expect(composeEloHistory(unrated, matches)).toEqual(emptyEloHistory())
		expect(composeEloHistory([], [])).toEqual(emptyEloHistory())
	})

	it('tolerates a missing match row and a missing delta', () => {
		const partial: EloHistoryRow[] = [
			{ id: 10, match_id: 99, outcome: 'draw', elo_before: 1200, elo_delta: null },
		]

		const history = composeEloHistory(partial, matches)
		expect(history.points.map((p) => p.elo)).toEqual([1200, 1200])
		expect(history.points[1].at).toBe(null)
		expect(history.current).toBe(1200)
	})
})

describe('composeRatings', () => {
	it('keys ratings by auth and omits rows with no rating', () => {
		const rows: RatingRow[] = [
			{ user_auth: 'a', elo: 1240 },
			{ user_auth: 'b', elo: null },
			{ user_auth: null, elo: 1300 },
		]

		const ratings = composeRatings(rows)
		expect(ratings.get('a')).toBe(1240)
		expect(ratings.has('b')).toBe(false)
		expect(ratings.size).toBe(1)
	})
})
