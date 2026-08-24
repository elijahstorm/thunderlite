import { writable } from 'svelte/store'

/**
 * The ladder movement the match that just ended produced for the local player,
 * published by `recordMatch` from the result endpoint's response and read by
 * the game-over screen.
 *
 * A store rather than a prop because the two ends are far apart: the writer is
 * a match-end subscriber with no view, and the reader is a deeply-nested HUD
 * modal. Null means "nothing to show" — an unrated match, a result that hasn't
 * come back yet, or a failed write — and the screen simply omits the line.
 */

export type MatchRating = {
	/** The rating carried INTO the match. */
	before: number
	/** Signed movement the result produced. */
	delta: number
}

export const matchRating = writable<MatchRating | null>(null)

/** Drop any rating from a previous match. Called as each new result is posted. */
export const clearMatchRating = (): void => matchRating.set(null)
