import { logToErrorDb } from '$lib/Security/serverLogs'
import { levelForPoints, pointsForResult, type MatchOutcome } from '$lib/progression'
import type postgres from 'postgres'

/**
 * getUserStats — aggregate a player's `match_players` rows into the profile
 * stats surfaced on `/me` and public profiles (J3). The aggregation is the pure
 * `computeStats(rows)` so it is unit-testable headless; `getUserStats` is the
 * thin DB wrapper around it.
 */

/** The single column `computeStats` needs from each `match_players` row. */
export type MatchPlayerRow = { outcome: MatchOutcome }

export type UserStats = {
	games: number
	wins: number
	losses: number
	draws: number
	/** Wins as a percentage of games, rounded to the nearest integer (0–100). */
	winRate: number
	points: number
	level: number
}

/** A zeroed record — what a brand-new account (no matches) shows. */
export const emptyStats = (): UserStats => ({
	games: 0,
	wins: 0,
	losses: 0,
	draws: 0,
	winRate: 0,
	points: 0,
	level: levelForPoints(0),
})

/**
 * Fold a player's match rows into a stats summary. Pure and total: an empty
 * list yields zeros (never an error), so a fresh account renders cleanly.
 */
export const computeStats = (rows: MatchPlayerRow[]): UserStats => {
	let wins = 0
	let losses = 0
	let draws = 0
	let points = 0

	for (const row of rows) {
		if (row.outcome === 'win') wins += 1
		else if (row.outcome === 'loss') losses += 1
		else if (row.outcome === 'draw') draws += 1
		points += pointsForResult(row.outcome)
	}

	const games = wins + losses + draws
	const winRate = games === 0 ? 0 : Math.round((wins / games) * 100)

	return { games, wins, losses, draws, winRate, points, level: levelForPoints(points) }
}

/**
 * Load and aggregate a player's match record. Defensive on purpose: a missing
 * auth or any DB hiccup (e.g. the migration not yet run) returns zeros rather
 * than throwing, so the profile page never 500s on stats alone.
 */
export const getUserStats = async (sql: postgres.Sql, auth: string): Promise<UserStats> => {
	if (!auth) return emptyStats()

	try {
		const rows = (await sql`
			select outcome from match_players where user_auth = ${auth}
		`) as unknown as MatchPlayerRow[]
		return computeStats(rows)
	} catch (msg) {
		logToErrorDb(sql)(msg)
		return emptyStats()
	}
}
