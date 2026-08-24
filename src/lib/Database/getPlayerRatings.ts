import { db } from '$lib/dontcode/server'

/**
 * getPlayerRatings — the one place that turns a set of accounts into their
 * ladder ratings.
 *
 * `user_stats.elo` is written only when a rated match settles, so most accounts
 * have no row at all: "no row" and "row with a null elo" both mean *unrated*,
 * and both come back as `null` here rather than as a seeded DEFAULT_ELO. A
 * player's displayed rating is a fact about games they actually played.
 *
 * Every caller hydrates a list it already has (a lobby roster, a page of
 * profiles, a match's opponents), so this is batched by design — the per-user
 * shape would be an N+1 on every one of those surfaces.
 *
 * Defensive like the other profile-side reads: a DB hiccup (or the migration
 * not yet run) yields an empty map, so a rating never takes a page down with
 * it. Callers render "Unrated" and move on.
 */

export type RatingRow = { user_auth: string | null; elo: number | null }

/** Fold raw `user_stats` rows into an auth → rating lookup. Pure. */
export const composeRatings = (rows: RatingRow[]): Map<string, number> => {
	const ratings = new Map<string, number>()
	for (const row of rows) {
		if (!row.user_auth || row.elo == null) continue
		ratings.set(row.user_auth, Number(row.elo))
	}
	return ratings
}

/**
 * Ratings for the given accounts, keyed by auth. Auths with no rated game are
 * simply absent from the map (so `map.get(auth) ?? null` reads as "unrated").
 */
export const getPlayerRatings = async (
	auths: (string | null | undefined)[]
): Promise<Map<string, number>> => {
	const unique = [...new Set(auths)].filter((auth): auth is string => !!auth)
	if (unique.length === 0) return new Map()

	try {
		const rows = await db.find<RatingRow>('user_stats', {
			where: { user_auth: { in: unique } },
			select: ['user_auth', 'elo'],
		})
		return composeRatings(rows)
	} catch {
		// Ratings are decoration on every surface that asks for them; a failure
		// here must degrade to "Unrated", never to a broken page.
		return new Map()
	}
}
