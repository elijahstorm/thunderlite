import { get, writable } from 'svelte/store'
import type { PerPlayerStats } from './matchEnd'

/**
 * matchStats — a lightweight per-player stat tracker that accumulates during a
 * live match and feeds `MatchResult.stats` (J1) at match-end. The core is the
 * pure `accumulate(stats, event)` reducer so the same logic is unit-testable and
 * could run server-side later; the module also holds a small mutable store that
 * `applyAction` pushes events into for *live* actions only (replay/headless skip
 * it, same rule as I3's SFX — see `applyAction.ts`), so reconnect replays never
 * double-count.
 */

export type PlayerMatchStats = {
	team: number
	unitsBuilt: number
	unitsLost: number
	damageDealt: number
	tilesCaptured: number
	turnsTaken: number
}

/** A resolved game moment worth counting. Emitted from `applyAction` per team. */
export type StatEvent =
	| { kind: 'build'; team: number }
	| { kind: 'loss'; team: number }
	| { kind: 'damage'; team: number; amount: number }
	| { kind: 'capture'; team: number }
	| { kind: 'turn'; team: number }

/** All players' stats, keyed by team index. */
export type MatchStatsByTeam = Record<number, PlayerMatchStats>

export const emptyPlayerStats = (team: number): PlayerMatchStats => ({
	team,
	unitsBuilt: 0,
	unitsLost: 0,
	damageDealt: 0,
	tilesCaptured: 0,
	turnsTaken: 0,
})

/**
 * Fold one resolved event into the running stats. Pure: returns a fresh object
 * and never mutates the input. Unknown teams are seeded with a zeroed row so the
 * first event for a player just works.
 */
export const accumulate = (stats: MatchStatsByTeam, event: StatEvent): MatchStatsByTeam => {
	const prev = stats[event.team] ?? emptyPlayerStats(event.team)
	const next: PlayerMatchStats = { ...prev }
	switch (event.kind) {
		case 'build':
			next.unitsBuilt += 1
			break
		case 'loss':
			next.unitsLost += 1
			break
		case 'damage':
			next.damageDealt += Math.max(0, event.amount)
			break
		case 'capture':
			next.tilesCaptured += 1
			break
		case 'turn':
			next.turnsTaken += 1
			break
	}
	return { ...stats, [event.team]: next }
}

/** Live tracker for the current match. Reset between matches (see GameStateManager). */
export const matchStats = writable<MatchStatsByTeam>({})

/** Record a single live stat event into the running tracker. */
export const recordMatchStat = (event: StatEvent): void => {
	matchStats.update((stats) => accumulate(stats, event))
}

/** Clear the tracker for a freshly started match. */
export const resetMatchStats = (): void => {
	matchStats.set({})
}

/**
 * Snapshot the tracker as a `PerPlayerStats[]` for `MatchResult.stats`, sorted by
 * team so the stats screen renders players in a stable order.
 */
export const matchStatsList = (): PerPlayerStats[] =>
	Object.values(get(matchStats)).sort((a, b) => a.team - b.team)
