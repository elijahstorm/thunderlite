/**
 * progression — pure points/level rules for a player's match record (J3).
 *
 * Mirrors the original Battalion: Arena progression (a win is worth the most, a
 * draw partial credit, a loss a small participation award) and is kept pure and
 * tunable here so the numbers can move without touching persistence or UI.
 *
 * This is also the home for **PvP elo**: the pure rating math lives at the
 * bottom, persistence reads/writes `user_stats.elo`, and online 1v1 results
 * apply it at settlement (matchSettlement.server.ts).
 */

export type MatchOutcome = 'win' | 'loss' | 'draw'

/** Casual points awarded per match outcome. Tunable. */
export const POINTS: Record<MatchOutcome, number> = {
	win: 10,
	draw: 5,
	loss: 1,
}

/** Points earned for a single match result. Unknown outcomes earn nothing. */
export const pointsForResult = (outcome: MatchOutcome): number => POINTS[outcome] ?? 0

/** How many casual points buy one level. */
export const POINTS_PER_LEVEL = 100

/**
 * Casual level for a lifetime points total. Level 1 is the floor (a brand-new
 * or negative/non-finite total never drops below 1), then one level per
 * `POINTS_PER_LEVEL`.
 */
export const levelForPoints = (points: number): number => {
	if (!Number.isFinite(points) || points <= 0) return 1
	return Math.floor(points / POINTS_PER_LEVEL) + 1
}

// === PvP elo ================================================================
// Ranked elo lives alongside the casual points above so a player's row has
// both a casual level and a competitive rating. Ratings persist in
// `user_stats.elo` and are settled server-side when an online 1v1 match locks
// its winner (see matchSettlement.server.ts).
export const DEFAULT_ELO = 1200

/** Standard rating-difference K factor. Tunable. */
export const ELO_K = 32

/**
 * Elo rating change for player A after a game against B. `score` is A's result:
 * 1 win, 0.5 draw, 0 loss. Standard expected-score formula, rounded to the
 * nearest whole point.
 */
export const eloDelta = (
	ratingA: number,
	ratingB: number,
	score: 0 | 0.5 | 1,
	k = ELO_K
): number => {
	const expected = 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
	return Math.round(k * (score - expected))
}

export type EloUpdate = { before: number; delta: number }

/**
 * Both sides' rating updates for a finished 1v1, from A's score. B's delta is
 * the exact negation of A's (not independently rounded), so a match is always
 * zero-sum and the ladder never leaks or mints points to rounding.
 */
export const eloUpdatesFor1v1 = (
	ratingA: number,
	ratingB: number,
	scoreA: 0 | 0.5 | 1,
	k = ELO_K
): [EloUpdate, EloUpdate] => {
	const delta = eloDelta(ratingA, ratingB, scoreA, k)
	return [
		{ before: ratingA, delta },
		{ before: ratingB, delta: -delta },
	]
}
