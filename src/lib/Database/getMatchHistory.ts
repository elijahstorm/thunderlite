import { logToErrorDb } from '$lib/Security/serverLogs'
import { getPlayerRatings } from '$lib/Database/getPlayerRatings'
import type { MatchOutcome } from '$lib/progression'
import { db } from '$lib/dontcode/server'

/**
 * getMatchHistory — a player's past matches for the reviewable history list on
 * `/my/games` (and the recent-games strip on `/me`). Same shape as
 * getUserStats: the fold from raw rows into display entries is the pure
 * `composeHistory(...)` so it is unit-testable headless, and `getMatchHistory`
 * is the thin DB wrapper that fetches the row sets in batched waves (the
 * platform API has no joins — see queryUsersByAuth for the idiom).
 */

export type HistoryPlayerRow = {
	/** `match_players.id` — serial, so descending id is newest-first. */
	id: number
	match_id: number
	team: number | null
	outcome: MatchOutcome
	elo_before: number | null
	elo_delta: number | null
}

export type HistoryMatchRow = {
	id: number
	mode: string
	winner_team: number | null
	turns: number
	ended_at: string | null
	map_id: string | null
	rated: boolean | null
	session_id: string | null
}

export type HistoryOpponentRow = {
	match_id: number
	user_auth: string | null
	team: number | null
	outcome: MatchOutcome
}

export type HistoryProfileRow = {
	auth: string
	username: string | null
	display_name: string | null
	profile_image_url: string | null
}

export type HistoryMapRow = { public_id: string; name: string | null }

export type MatchHistoryOpponent = {
	auth: string
	team: number | null
	outcome: MatchOutcome
	username: string | null
	displayName: string | null
	avatarUrl: string | null
	/** The opponent's rating TODAY, not at the time of the match — the history
	 *  row only stores the viewer's own snapshot. Null when they're unrated. */
	elo: number | null
}

export type MatchHistoryEntry = {
	matchId: number
	mode: 'online' | 'hotseat' | 'campaign'
	outcome: MatchOutcome
	team: number | null
	turns: number
	endedAt: string | null
	mapId: string | null
	mapName: string | null
	rated: boolean
	/** Signed ladder movement this match produced, or null when unrated. */
	eloDelta: number | null
	/** The viewer's rating going INTO the match, or null when unrated. */
	eloBefore: number | null
	/** The viewer's rating coming OUT of the match, or null when unrated. */
	eloAfter: number | null
	opponents: MatchHistoryOpponent[]
	/** True when the match has a persisted action log to watch (online play). */
	reviewable: boolean
}

const isMode = (v: unknown): v is MatchHistoryEntry['mode'] =>
	v === 'online' || v === 'hotseat' || v === 'campaign'

/**
 * Fold the fetched row sets into display entries, preserving `mine`'s order
 * (the wrapper fetches it newest-first). Pure and total: a player row whose
 * match row is missing (mid-write, or a mode this UI doesn't know) is skipped
 * rather than rendered broken; missing profiles/maps just leave their labels
 * null for the UI to fall back on.
 */
export const composeHistory = (
	mine: HistoryPlayerRow[],
	matches: HistoryMatchRow[],
	opponents: HistoryOpponentRow[],
	profiles: HistoryProfileRow[],
	maps: HistoryMapRow[],
	/** Opponent auth → current ladder rating. Absent entries read as unrated. */
	ratings: Map<string, number> = new Map()
): MatchHistoryEntry[] => {
	const matchById = new Map(matches.map((m) => [Number(m.id), m]))
	const profileByAuth = new Map(profiles.map((p) => [p.auth, p]))
	const mapNameById = new Map(maps.map((m) => [m.public_id, m.name ?? null]))

	const opponentsByMatch = new Map<number, MatchHistoryOpponent[]>()
	for (const row of opponents) {
		if (!row.user_auth) continue
		const profile = profileByAuth.get(row.user_auth)
		const list = opponentsByMatch.get(Number(row.match_id)) ?? []
		list.push({
			auth: row.user_auth,
			team: row.team == null ? null : Number(row.team),
			outcome: row.outcome,
			username: profile?.username ?? null,
			displayName: profile?.display_name ?? null,
			avatarUrl: profile?.profile_image_url ?? null,
			elo: ratings.get(row.user_auth) ?? null,
		})
		opponentsByMatch.set(Number(row.match_id), list)
	}

	const entries: MatchHistoryEntry[] = []
	for (const row of mine) {
		const match = matchById.get(Number(row.match_id))
		if (!match || !isMode(match.mode)) continue
		entries.push({
			matchId: Number(match.id),
			mode: match.mode,
			outcome: row.outcome,
			team: row.team == null ? null : Number(row.team),
			turns: Number(match.turns ?? 0),
			endedAt: match.ended_at ?? null,
			mapId: match.map_id ?? null,
			mapName: match.map_id ? (mapNameById.get(match.map_id) ?? null) : null,
			rated: !!match.rated,
			eloDelta: row.elo_delta == null ? null : Number(row.elo_delta),
			eloBefore: row.elo_before == null ? null : Number(row.elo_before),
			eloAfter: row.elo_before == null ? null : Number(row.elo_before) + Number(row.elo_delta ?? 0),
			opponents: opponentsByMatch.get(Number(row.match_id)) ?? [],
			reviewable: match.mode === 'online' && match.session_id != null,
		})
	}
	return entries
}

/**
 * Load one newest-first page of a player's match history. Defensive like
 * `getUserStats`: a missing auth or any DB hiccup returns an empty page rather
 * than throwing, so the history page never 500s on the list alone.
 */
export const getMatchHistory = async (
	auth: string,
	{ limit = 25, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<{ entries: MatchHistoryEntry[]; total: number }> => {
	if (!auth) return { entries: [], total: 0 }

	try {
		// Wave 1: the player's own rows (newest-first page) and the total count.
		const [mine, total] = await Promise.all([
			db.find<HistoryPlayerRow>('match_players', {
				where: { user_auth: auth },
				select: ['id', 'match_id', 'team', 'outcome', 'elo_before', 'elo_delta'],
				orderBy: { id: 'desc' },
				limit,
				offset,
			}),
			db.count('match_players', { user_auth: auth }),
		])
		if (mine.length === 0) return { entries: [], total }

		// Wave 2: the match rows and the other participants of those matches.
		const matchIds = [...new Set(mine.map((r) => Number(r.match_id)))]
		const [matches, others] = await Promise.all([
			db.find<HistoryMatchRow>('matches', {
				where: { id: { in: matchIds } },
				select: ['id', 'mode', 'winner_team', 'turns', 'ended_at', 'map_id', 'rated', 'session_id'],
			}),
			db.find<HistoryOpponentRow>('match_players', {
				where: { match_id: { in: matchIds }, user_auth: { not: auth } },
				select: ['match_id', 'user_auth', 'team', 'outcome'],
			}),
		])

		// Wave 3: display labels — opponent profiles and map names.
		const opponentAuths = [...new Set(others.map((o) => o.user_auth).filter(Boolean))] as string[]
		const mapIds = [...new Set(matches.map((m) => m.map_id).filter(Boolean))] as string[]
		const [profiles, maps, ratings] = await Promise.all([
			opponentAuths.length
				? db.find<HistoryProfileRow>('profiles', {
						where: { auth: { in: opponentAuths } },
						select: ['auth', 'username', 'display_name', 'profile_image_url'],
					})
				: Promise.resolve<HistoryProfileRow[]>([]),
			mapIds.length
				? db.find<HistoryMapRow>('maps', {
						where: { public_id: { in: mapIds } },
						select: ['public_id', 'name'],
					})
				: Promise.resolve<HistoryMapRow[]>([]),
			getPlayerRatings(opponentAuths),
		])

		return { entries: composeHistory(mine, matches, others, profiles, maps, ratings), total }
	} catch (msg) {
		await logToErrorDb(msg)
		return { entries: [], total: 0 }
	}
}
