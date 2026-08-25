import type { SerializedAction } from '$lib/Engine/Interactor/serializedAction'

/**
 * matchTurns — how many ROUNDS a recorded match ran, derived from its event log.
 *
 * `matches.turns` used to be whatever the first client to reach `gameOver` said
 * `gameState.turnNumber` was. That is a number only that one browser can see,
 * and a client whose engine has drifted from the room reports a drifted count:
 * match 19's row claims 46 rounds against a log that reaches 24. The log, by
 * contrast, is the room's shared truth — every client replays it and lands on
 * the same board — so the round count belongs there too.
 *
 * The engine's rule (see `nextActiveTeam`) is that a round ticks over when the
 * turn handover WRAPS: `state.players` is sorted ascending by team, so a
 * handover wraps exactly when the receiving team's index is at or below the
 * ending team's — i.e. when `next <= current`. Eliminated sides are skipped, and
 * that is already baked into the `next` an `end-turn` event carries, so this
 * needs no knowledge of who is still alive (which the server does not have —
 * it cannot see a defeat by combat).
 */

/** One end-turn as the counter sees it: who ended, and who they handed to. */
export type TurnHandover = {
	/** The team that ended its turn, or null when the log doesn't say. */
	from: number | null
	/** The team the ending client's engine advanced to, or null when absent. */
	to: number | null
}

/** The handovers in a log, in order. Non-end-turn actions are ignored. */
export const handoversFromLog = (
	log: readonly { action: SerializedAction; team: number | null }[]
): TurnHandover[] => {
	const handovers: TurnHandover[] = []
	for (const entry of log) {
		if (entry.action?.kind !== 'end-turn') continue
		const to = typeof entry.action.next === 'number' ? entry.action.next : null
		handovers.push({ from: entry.team, to })
	}
	// An `end-turn` written before the `next` field existed says who ended but not
	// who came after. The following handover's `from` is that same answer, so fill
	// it in rather than dropping the round it belongs to.
	for (let i = 0; i < handovers.length; i++) {
		if (handovers[i].to == null) handovers[i].to = handovers[i + 1]?.from ?? null
	}
	return handovers
}

/**
 * Rounds played, counting from 1 the way `gameState.turnNumber` does. A handover
 * with either end unknown is skipped rather than guessed — an unattributable
 * event must not invent or swallow a round.
 */
export const roundsFromHandovers = (handovers: readonly TurnHandover[]): number => {
	let rounds = 1
	for (const { from, to } of handovers) {
		if (from == null || to == null) continue
		if (to <= from) rounds++
	}
	return rounds
}

/** `roundsFromHandovers` straight off a log. */
export const roundsFromLog = (
	log: readonly { action: SerializedAction; team: number | null }[]
): number => roundsFromHandovers(handoversFromLog(log))
