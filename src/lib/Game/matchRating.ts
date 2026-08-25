import { writable } from 'svelte/store'

/**
 * The ladder movement the match that just ended produced, published by
 * `recordMatch` from the result endpoint's response and read by the end-of-game
 * report.
 *
 * A store rather than a prop because the two ends are far apart: the writer is
 * a match-end subscriber with no view, and the reader is a deeply-nested HUD
 * screen. Null means "nothing to show" — an unrated match, a result that hasn't
 * come back yet, or a failed write — and the report simply omits the section.
 */

/** One side's movement: the rating carried in, and the signed change applied. */
export type RatingMove = {
	/** The rating carried INTO the match. */
	before: number
	/** Signed movement the result produced. */
	delta: number
}

export type MatchRating = RatingMove & {
	/**
	 * Every seat the server settled, keyed by team, so the report can show both
	 * sides of a rated 1v1 rather than only the local player's line. The local
	 * player's own move is duplicated here under their team.
	 */
	byTeam: Record<number, RatingMove>
}

export const matchRating = writable<MatchRating | null>(null)

/** Drop any rating from a previous match. Called as each new result is posted. */
export const clearMatchRating = (): void => matchRating.set(null)
