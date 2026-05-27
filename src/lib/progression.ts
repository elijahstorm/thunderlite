/**
 * progression — pure points/level rules for a player's match record (J3).
 *
 * Mirrors the original Battalion: Arena progression (a win is worth the most, a
 * draw partial credit, a loss a small participation award) and is kept pure and
 * tunable here so the numbers can move without touching persistence or UI.
 *
 * This is also the agreed home for **PvP elo** when ranked play lands. The J
 * epic only ships the simple casual points below; the elo seam at the bottom is
 * intentionally a clearly-marked stub so persistence and the stats panel already
 * have a place to read a rating from.
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

// === PvP elo seam ===========================================================
// Ranked elo will live alongside the casual points above so a player's row has
// both a casual level and a competitive rating. The J epic does not compute elo
// yet; this is the documented stub future ranked work fills in.
export const DEFAULT_ELO = 1200

/**
 * Elo rating change for player A after a game against B. `score` is A's result:
 * 1 win, 0.5 draw, 0 loss. Returns 0 today — wire the standard expected-score
 * formula here when ranked play ships.
 */
export const eloDelta = (
	_ratingA: number,
	_ratingB: number,
	_score: 0 | 0.5 | 1,
	_k = 32
): number => {
	// TODO(PvP): const expected = 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
	//            return Math.round(k * (score - expected))
	return 0
}
