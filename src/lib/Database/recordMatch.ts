import { onMatchEnd, type MatchResult } from '$lib/Engine/matchEnd'
import {
	clearMatchRating,
	matchRating,
	type MatchRating,
	type RatingMove,
} from '$lib/Game/matchRating'

/**
 * recordMatch — a J1 `onMatchEnd` subscriber that persists match results. It is
 * deliberately ignorant of the other subscribers (stats screen J2, campaign
 * unlocks K3): all of them hang off the single match-end event independently.
 *
 * - Online (sessionId present): POST the local player's claim to the session
 *   result endpoint, which authorises against the H2 KV state and writes the
 *   row server-side. Every participant posts their own row.
 * - Hot-seat / campaign: record only the signed-in human's own row.
 * - Fully anonymous play records nothing (the endpoint also rejects
 *   unauthenticated writes, so this is enforced on both ends).
 *
 * Writes are best-effort and fire-and-forget — a failed POST must never block
 * the UI or the other match-end subscribers. The online POST's response is the
 * one thing read back: it carries the local player's ladder movement, which the
 * game-over screen shows. A failure there just leaves the rating line off.
 */

type RawMove = { before?: unknown; delta?: unknown }
type ResultResponse = {
	/** The caller's own movement. */
	elo?: RawMove | null
	/** Every settled seat, so the report can show both sides of a rated 1v1. */
	ratings?: (RawMove & { team?: unknown })[] | null
}

const post = (path: string, payload: unknown, onResult?: (data: ResultResponse) => void): void => {
	if (typeof fetch !== 'function') return
	void fetch(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload),
	})
		.then((response) => (onResult && response.ok ? response.json() : null))
		.then((data) => data && onResult?.(data as ResultResponse))
		.catch(() => {
			// Persistence is best-effort; swallow network/server errors.
		})
}

const asMove = (raw: RawMove | null | undefined): RatingMove | null => {
	// Nullish checked before Number(), which reads null/'' as a very convincing 0.
	if (raw?.before == null || raw?.delta == null) return null
	const before = Number(raw.before)
	const delta = Number(raw.delta)
	if (!Number.isFinite(before) || !Number.isFinite(delta)) return null
	return { before, delta }
}

/**
 * Fold a result response into the ladder movement the report renders. Both
 * sides are kept (keyed by team) so the report can show the whole exchange;
 * the local player's own row is what decides whether there is anything to show
 * at all, so an unrated match folds to null. Exported for tests — the response
 * is untrusted JSON and every field needs a numeric guard.
 */
export const parseRatingResponse = (
	data: ResultResponse,
	localTeam: number
): MatchRating | null => {
	const byTeam: Record<number, RatingMove> = {}
	for (const row of data?.ratings ?? []) {
		const move = asMove(row)
		if (!move || !Number.isInteger(row?.team)) continue
		byTeam[Number(row.team)] = move
	}

	const local = asMove(data?.elo) ?? byTeam[localTeam]
	if (!local) return null
	byTeam[localTeam] ??= local
	return { ...local, byTeam }
}

/** Publish the ladder movement the server settled, if this match was rated. */
const publishRating = (data: ResultResponse, localTeam: number): void => {
	const rating = parseRatingResponse(data, localTeam)
	if (rating) matchRating.set(rating)
}

export const recordMatch = (result: MatchResult): void => {
	// Whatever this match turns out to be, it is not the previous one — drop any
	// rating still on screen from an earlier game before the new one resolves.
	clearMatchRating()

	if (result.mode === 'online') {
		if (!result.sessionId) return
		const local = result.players.find((p) => p.isLocal)
		if (!local) return
		post(
			`/api/game/${result.sessionId}/result`,
			{
				mode: 'online',
				team: local.team,
				winner: result.winner,
				turns: result.turns,
				mapSha: result.mapSha ?? null,
			},
			(data) => publishRating(data, local.team)
		)
		return
	}

	// Hot-seat / campaign: persist only the signed-in human's row. A CPU has
	// nothing to record. 'local' is a placeholder session segment; the endpoint
	// keys off `mode`, not the param, for non-online results.
	const local = result.players.find((p) => p.isLocal && !p.isCpu)
	if (!local) return
	post(`/api/game/local/result`, {
		mode: result.mode,
		team: local.team,
		outcome: local.outcome,
		winner: result.winner,
		turns: result.turns,
		mapSha: result.mapSha ?? null,
	})
}

/** Register `recordMatch` as a match-end subscriber. Returns an unsubscribe. */
export const registerRecordMatch = (): (() => void) => onMatchEnd(recordMatch)
