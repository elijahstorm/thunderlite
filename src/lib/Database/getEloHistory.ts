import { logToErrorDb } from '$lib/Security/serverLogs'
import type { MatchOutcome } from '$lib/progression'
import { db } from '$lib/dontcode/server'

/**
 * getEloHistory — a player's ladder curve for the rating chart on `/me` and
 * public profiles.
 *
 * There is no rating-history table and none is needed: settlement already
 * stamps `elo_before` / `elo_delta` onto each rated `match_players` row, so the
 * whole curve is `before` then a running `before + delta` per match, in match
 * order. Reading it back beats maintaining a second write path that could
 * disagree with the ladder.
 *
 * Same shape as its siblings: the fold is the pure `composeEloHistory(...)` so
 * it is unit-testable headless, and the export is a thin, defensive DB wrapper.
 */

export type EloHistoryRow = {
	/** `match_players.id` — serial, so ascending id is oldest-first. */
	id: number
	match_id: number
	outcome: MatchOutcome
	elo_before: number | null
	elo_delta: number | null
}

export type EloHistoryMatchRow = { id: number; ended_at: string | null }

export type EloPoint = {
	/** The match that produced this rating, or null for the starting point. */
	matchId: number | null
	/** When the match ended, when known. The chart falls back to point order. */
	at: string | null
	/** The rating standing AFTER this match. */
	elo: number
	/** Signed movement this match produced; null on the starting point. */
	delta: number | null
	outcome: MatchOutcome | null
}

export type EloHistory = {
	/** Oldest-first, and prefixed with the rating the player carried INTO their
	 *  first rated match — so even a single rated game draws a line, not a dot. */
	points: EloPoint[]
	/** Highest rating ever held, or null with no rated games. */
	peak: number | null
	/** Current rating (the last point), or null with no rated games. */
	current: number | null
	/** How many rated matches the curve covers. */
	rated: number
}

export const emptyEloHistory = (): EloHistory => ({
	points: [],
	peak: null,
	current: null,
	rated: 0,
})

/**
 * Fold rated player rows into a chart series. Pure and total: rows are sorted
 * oldest-first here rather than trusted, a row missing its `elo_before` is
 * skipped (it isn't a rated result), and an empty input yields an empty
 * history rather than an error.
 */
export const composeEloHistory = (
	rows: EloHistoryRow[],
	matches: EloHistoryMatchRow[] = []
): EloHistory => {
	const endedById = new Map(matches.map((m) => [Number(m.id), m.ended_at ?? null]))

	const rated = rows
		.filter((row) => row.elo_before != null)
		.sort((a, b) => Number(a.id) - Number(b.id))

	if (rated.length === 0) return emptyEloHistory()

	const first = rated[0]
	const points: EloPoint[] = [
		{
			matchId: null,
			at: endedById.get(Number(first.match_id)) ?? null,
			elo: Number(first.elo_before),
			delta: null,
			outcome: null,
		},
	]

	// The ladder is walked forward from each row's own `elo_before` rather than
	// accumulated from the seed: an unrated stretch, a manual correction, or a
	// future decay pass would otherwise make the curve drift away from the
	// rating the player actually held.
	for (const row of rated) {
		points.push({
			matchId: Number(row.match_id),
			at: endedById.get(Number(row.match_id)) ?? null,
			elo: Number(row.elo_before) + Number(row.elo_delta ?? 0),
			delta: row.elo_delta == null ? null : Number(row.elo_delta),
			outcome: row.outcome,
		})
	}

	return {
		points,
		peak: points.reduce((high, point) => Math.max(high, point.elo), points[0].elo),
		current: points[points.length - 1].elo,
		rated: rated.length,
	}
}

/**
 * Load a player's most recent rated matches and fold them into a curve.
 * Defensive like `getUserStats` / `getMatchHistory`: a missing auth or any DB
 * failure returns an empty history rather than throwing, so the profile page
 * never 500s on the chart alone.
 */
export const getEloHistory = async (
	auth: string,
	{ limit = 50 }: { limit?: number } = {}
): Promise<EloHistory> => {
	if (!auth) return emptyEloHistory()

	try {
		// Newest-first with a limit is the only way to cap the query; the fold
		// re-sorts to oldest-first for the chart.
		const rows = await db.find<EloHistoryRow>('match_players', {
			where: { user_auth: auth, elo_before: { not: null } },
			select: ['id', 'match_id', 'outcome', 'elo_before', 'elo_delta'],
			orderBy: { id: 'desc' },
			limit,
		})
		if (rows.length === 0) return emptyEloHistory()

		const matchIds = [...new Set(rows.map((row) => Number(row.match_id)))]
		const matches = await db
			.find<EloHistoryMatchRow>('matches', {
				where: { id: { in: matchIds } },
				select: ['id', 'ended_at'],
			})
			.catch(() => [] as EloHistoryMatchRow[])

		return composeEloHistory(rows, matches)
	} catch (msg) {
		await logToErrorDb(msg)
		return emptyEloHistory()
	}
}
