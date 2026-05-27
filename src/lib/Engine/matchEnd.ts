import type { GameState } from './gameState'

/**
 * matchEnd — the single "this match ended" moment.
 *
 * `winConditions.ts` detects a terminal board state and flips `gameState.phase`
 * to `'gameOver'`; this module turns that into one typed `MatchResult` that any
 * number of independent features subscribe to: the end-game stats screen (J2),
 * result persistence (J3), campaign unlocks (K3), and eventual PvP elo. Keeping
 * the result mode-agnostic means campaign, hotseat, and online all flow through
 * the same event.
 */

export type MatchOutcome = 'win' | 'loss' | 'draw'

export type MatchMode = 'campaign' | 'hotseat' | 'online'

export type MatchPlayer = {
	team: number
	userAuth?: string
	outcome: MatchOutcome
	isLocal: boolean
	isCpu: boolean
}

/**
 * Per-player end-of-match statistics. J2 owns the tracker that produces these;
 * J1 only carries the array through `MatchResult.stats`. Left open so J2 can
 * define concrete fields without J1 having to change.
 */
export type PerPlayerStats = {
	team: number
	[field: string]: unknown
}

export type MatchResult = {
	mode: MatchMode
	sessionId?: string // online (H2)
	mapSha?: string
	campaignLevelId?: string // campaign (K)
	winner: number | null // winning team index, null = draw
	players: MatchPlayer[]
	turns: number
	endedAt: number
	stats?: PerPlayerStats[] // populated by J2's tracker if present
}

type Handler = (result: MatchResult) => void

const handlers = new Set<Handler>()
let emitted = false
let lastResult: MatchResult | null = null

/**
 * Register a handler for match-end. Returns an unsubscribe function that removes
 * only that handler. Handlers are long-lived across matches; only the
 * emit-once guard resets between matches (see `resetMatchEnd`).
 */
export const onMatchEnd = (handler: Handler): (() => void) => {
	handlers.add(handler)
	return () => {
		handlers.delete(handler)
	}
}

/**
 * Dispatch the match result to every subscriber. Idempotent per match: once a
 * match has emitted, further calls are no-ops until `resetMatchEnd` is called
 * for a new match. This is what makes re-evaluating win conditions safe — the
 * engine may call into the terminal path many times, but subscribers fire once.
 */
export const emitMatchEnd = (result: MatchResult): void => {
	if (emitted) return
	emitted = true
	lastResult = result
	// Snapshot so a handler that subscribes/unsubscribes during dispatch does
	// not change who we notify this round.
	for (const handler of [...handlers]) {
		handler(result)
	}
}

/** Clear the emit-once guard so a freshly started match can emit again. */
export const resetMatchEnd = (): void => {
	emitted = false
	lastResult = null
}

/** True once the current match has emitted its result. */
export const matchEnded = (): boolean => emitted

/**
 * The result of the current match, or null if it has not ended. Lets a
 * subscriber that mounts *after* the terminal moment (e.g. a stats screen shown
 * on game-over) still read the outcome instead of missing the event.
 */
export const lastMatchResult = (): MatchResult | null => lastResult

export type BuildMatchResultArgs = {
	state: GameState
	/** Winning team index from the engine's authoritative state, or null for a draw. */
	winner: number | null
	mode: MatchMode
	/** The team controlled on this machine (used to flag `isLocal`). */
	localTeam: number
	/** Whether a given team is CPU-controlled. Defaults to no team being CPU. */
	isCpuTeam?: (team: number) => boolean
	/** Auth/identity for a team, when known (online). */
	userAuthForTeam?: (team: number) => string | undefined
	sessionId?: string
	mapSha?: string
	campaignLevelId?: string
	/** Carried through from J2's tracker, if present. */
	stats?: PerPlayerStats[]
	/** Injectable clock for deterministic tests. Defaults to `Date.now`. */
	now?: () => number
}

/**
 * Build a `MatchResult` from final game state. Pure (aside from the clock) so it
 * runs headless in vitest. Per-player `outcome` is derived from the authoritative
 * `winner`: a null winner is a draw for everyone, otherwise the winning team wins
 * and all others lose.
 */
export const buildMatchResult = (args: BuildMatchResultArgs): MatchResult => {
	const { state, winner, mode, localTeam } = args
	const isCpuTeam = args.isCpuTeam ?? (() => false)

	const players: MatchPlayer[] = state.players.map((player) => ({
		team: player.team,
		userAuth: args.userAuthForTeam?.(player.team),
		outcome: winner === null ? 'draw' : player.team === winner ? 'win' : 'loss',
		isLocal: player.team === localTeam,
		isCpu: isCpuTeam(player.team),
	}))

	return {
		mode,
		sessionId: args.sessionId,
		mapSha: args.mapSha,
		campaignLevelId: args.campaignLevelId,
		winner,
		players,
		turns: state.turnNumber,
		endedAt: (args.now ?? Date.now)(),
		...(args.stats ? { stats: args.stats } : {}),
	}
}
