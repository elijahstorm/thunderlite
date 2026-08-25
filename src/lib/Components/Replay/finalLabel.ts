import type { GameState } from '$lib/Engine/gameState'

/**
 * What the replay says when the log runs out, reconciled against the log itself.
 *
 * Two independent records describe a finished match. The `matches` row carries
 * `winner_team`, posted by whichever client reached `gameOver` first. The event
 * log carries the actions, and replaying it re-runs the same `applyWinConditions`
 * that decided the match live. They are written by different paths and they can
 * disagree: match 19's row names team 1 the winner with an `ended_at` four and a
 * half minutes before its log stopped growing, and the log's last frame is an
 * attack with no end-turn after it, with two sides still standing.
 *
 * The log wins whenever it produces a verdict, because that is the record the
 * viewer just watched. When it doesn't, the banner says so rather than asserting
 * an outcome the playback never reached; the row's claim still rides along, since
 * it is why the match is in the history at all.
 */
export const replayFinalLabel = (
	state: Pick<GameState, 'phase' | 'winner'>,
	rowWinner: number | null,
	teamName: (team: number | null) => string
): string => {
	if (state.phase === 'gameOver') {
		const winner = state.winner ?? null
		return winner == null ? 'Draw' : `${teamName(winner)} wins`
	}
	if (rowWinner == null) return 'Log ends mid-match'
	return `Log ends mid-match (recorded: ${teamName(rowWinner)} wins)`
}
