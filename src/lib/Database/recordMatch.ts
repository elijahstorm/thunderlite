import { onMatchEnd, type MatchResult } from '$lib/Engine/matchEnd'

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
 * the UI or the other match-end subscribers.
 */

const post = (path: string, payload: unknown): void => {
	if (typeof fetch !== 'function') return
	void fetch(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload),
	}).catch(() => {
		// Persistence is best-effort; swallow network/server errors.
	})
}

export const recordMatch = (result: MatchResult): void => {
	if (result.mode === 'online') {
		if (!result.sessionId) return
		const local = result.players.find((p) => p.isLocal)
		if (!local) return
		post(`/api/game/${result.sessionId}/result`, {
			mode: 'online',
			team: local.team,
			winner: result.winner,
			turns: result.turns,
			mapSha: result.mapSha ?? null,
		})
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
