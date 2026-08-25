// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseRatingResponse } from '../../src/lib/Database/recordMatch'

/**
 * The end-of-game report shows both sides' ladder movement, folded out of the
 * result endpoint's response. That response is untrusted JSON (and is empty for
 * every unrated match), so the fold is what keeps the report honest.
 */
describe('parseRatingResponse', () => {
	it('keeps every settled seat keyed by team', () => {
		const rating = parseRatingResponse(
			{
				elo: { before: 1212, delta: 12 },
				ratings: [
					{ team: 0, before: 1212, delta: 12 },
					{ team: 1, before: 1180, delta: -12 },
				],
			},
			0
		)

		expect(rating).toEqual({
			before: 1212,
			delta: 12,
			byTeam: {
				0: { before: 1212, delta: 12 },
				1: { before: 1180, delta: -12 },
			},
		})
	})

	it('folds an unrated match to null so the report omits the section', () => {
		expect(parseRatingResponse({ elo: null, ratings: [] }, 0)).toBeNull()
		expect(parseRatingResponse({}, 0)).toBeNull()
	})

	it('falls back to the local seat when the response carries only per-team rows', () => {
		const rating = parseRatingResponse({ ratings: [{ team: 1, before: 1180, delta: -12 }] }, 1)
		expect(rating).toEqual({
			before: 1180,
			delta: -12,
			byTeam: { 1: { before: 1180, delta: -12 } },
		})
	})

	it('drops rows with an unusable team or rating', () => {
		const rating = parseRatingResponse(
			{
				elo: { before: 1200, delta: 8 },
				ratings: [
					{ team: 'one', before: 1180, delta: -8 },
					{ team: 2, before: null, delta: -8 },
					{ team: 3, before: 1100, delta: 'nope' },
				],
			},
			0
		)

		expect(rating).toEqual({ before: 1200, delta: 8, byTeam: { 0: { before: 1200, delta: 8 } } })
	})
})
