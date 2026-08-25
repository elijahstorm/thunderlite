/**
 * eventQueue — the single, strictly ordered path every inbound game event takes
 * on its way to the board.
 *
 * This exists because ordering was broken, and the breakage was invisible.
 * Applying a remote move is not instantaneous: the animator lifts the unit off
 * its source tile, awaits the slide, and only commits the state when the slide
 * lands. For those few hundred milliseconds the mover is on NEITHER tile. The
 * socket layer used to have two ways in — the realtime push, which queued behind
 * the animation, and the reconciliation poll, which applied straight to the
 * board — so a poll landing inside that window applied the NEXT action against a
 * board where the mover did not exist.
 *
 * In practice that meant: a tank moves and attacks in one player's turn; the
 * opponent's client animates the move, the poll arrives mid-slide with the
 * attack, `applyAttack` finds no attacker on the source tile and returns. The
 * tank slides into position and simply never fires. One client has a damaged
 * unit, the other doesn't, neither is told, and every later exchange compounds
 * the difference.
 *
 * The rule this enforces is therefore absolute: an event is applied only from
 * `drain`, only after the previous event has fully finished (animation
 * included), and only in the order it was accepted. There is no fast path. A
 * caller that wants an event on the board pushes it and waits its turn.
 */

import { hasRemoteChoreography, remoteChoreographyMs } from '$lib/Engine/remoteChoreography'
import type { SerializedAction } from '$lib/Engine/Interactor/serializedAction'

/** How the event reached this client — the field that exposes ordering bugs. */
export type EventTransport = 'push' | 'poll'

export type QueuedEvent = {
	/** `GameEvent.id` (the room's log sequence number). */
	id: number
	action: SerializedAction
	/**
	 * Whether this event is eligible for full choreography. False for catch-up and
	 * backfill, which fast-forward instantly so a reconnect doesn't replay the
	 * whole match in slow motion. Eligibility is decided when the event is
	 * accepted; whether it actually animates is decided at drain time (an event
	 * with a long backlog behind it is fast-forwarded to keep up — see
	 * SMOOTH_BACKLOG).
	 */
	animate: boolean
	/**
	 * Whether this event reached us as live play rather than as history.
	 *
	 * False for everything replayed out of the event log on the way in — the
	 * catch-up poll after a load, and any gap backfill. That distinction is not
	 * cosmetic: an action that fails to apply while we are REPLAYING the log is a
	 * hole in the log itself, which every client replays identically and which no
	 * amount of resyncing can close. One that fails during live play means this
	 * client alone has drifted. Only the second is a desync worth freezing the
	 * board over. See `GameSocket`'s desync listener.
	 */
	live: boolean
	via: EventTransport
}

export type EventQueueHandlers = {
	/** Play an action's choreography and commit it. Awaited — the queue blocks. */
	animate: (action: SerializedAction, entry: QueuedEvent) => Promise<void>
	/** Commit an action instantly, no choreography. */
	apply: (action: SerializedAction, entry: QueuedEvent) => void
	/** True while the board is available; a queue with no board idles in place. */
	ready: () => boolean
	/** Called after each event lands, with whether it was animated. */
	onApplied?: (entry: QueuedEvent, animated: boolean) => void
	/** Called when an event is discarded because the board went away. */
	onDropped?: (entry: QueuedEvent) => void
}

/**
 * Which kinds have choreography worth waiting on. Deliberately delegated to
 * `animateRemoteAction`'s own list rather than restated here: this used to be a
 * local `move || attack` check, so a repair — which HAS an animation (its health
 * bar eases up, exactly as it does for the player who ordered it) — was routed
 * down the instant path and the watching opponent just saw the HP snap.
 */
const isAnimatable = (action: SerializedAction): boolean => hasRemoteChoreography(action)

/**
 * How much catch-up may be waiting behind an event and still let it animate,
 * measured in playback time rather than event count.
 *
 * The count-based version of this rule was wrong in a way that only showed up
 * once relays were batched. It began at zero — an event with ANYTHING behind it
 * was fast-forwarded — then rose to two, so a short bunch played out. But a
 * whole CPU turn arrives as one contiguous run now, and a turn is a dozen or
 * more actions, so every one of them but the last two teleported. That is
 * precisely the thing a player is watching for: the ORDER a side moved its units
 * in, and the moves themselves. A board that rearranges itself in one silent
 * jump does not tell you what the opponent did, and no amount of "the state is
 * identical either way" makes it play the same.
 *
 * So the question is not "how many are behind this one" but "how long would it
 * take to watch them all". A dozen moves at ~200ms a tile is a few seconds of
 * catch-up, which is exactly the case worth playing out. A client that lost the
 * network for a minute, or whose tab was backgrounded until its animation timers
 * were throttled to a crawl, comes back to a backlog measured in minutes — and
 * making someone watch that before they can act is worse than skipping it.
 *
 * The budget is therefore set just above a turn's worth of play. Everything a
 * live game normally delivers, including a full CPU turn, animates in full;
 * only a genuine backlog is fast-forwarded, and only until it fits again — the
 * tail of it still plays out, so the player rejoins live play watching rather
 * than mid-jump.
 */
export const CATCHUP_BUDGET_MS = 9000

/**
 * Playback time of the animatable events behind this one. Stops counting once it
 * is over budget: the only question is which side of the line we are on, and a
 * backlog of hundreds should not cost a full scan per event.
 */
const backlogMs = (pending: QueuedEvent[]): number => {
	let total = 0
	for (const entry of pending) {
		if (!entry.animate || !isAnimatable(entry.action)) continue
		total += remoteChoreographyMs(entry.action)
		if (total > CATCHUP_BUDGET_MS) return total
	}
	return total
}

export const createEventQueue = (handlers: EventQueueHandlers) => {
	const pending: QueuedEvent[] = []
	let draining = false

	const drain = async (): Promise<void> => {
		// Re-entrancy guard, not a lock: an in-flight drain picks up anything pushed
		// while it was awaiting, so a second call has nothing to do.
		if (draining) return
		draining = true
		try {
			while (pending.length) {
				const entry = pending.shift()!
				if (!handlers.ready()) {
					handlers.onDropped?.(entry)
					continue
				}
				// Animate a live move/attack unless watching the backlog behind it would
				// take longer than a player should be made to wait. A normal turn — even
				// a CPU side's whole turn, which now arrives in one batch — is inside
				// the budget and plays out in full.
				const animated =
					entry.animate && isAnimatable(entry.action) && backlogMs(pending) <= CATCHUP_BUDGET_MS
				if (animated) await handlers.animate(entry.action, entry)
				else handlers.apply(entry.action, entry)
				handlers.onApplied?.(entry, animated)
			}
		} finally {
			draining = false
		}
	}

	return {
		/** Accept an event. It is applied from `drain`, never here. */
		push(entry: QueuedEvent): void {
			pending.push(entry)
			void drain()
		},
		/** Events accepted but not yet on the board. */
		get size(): number {
			return pending.length
		},
		/** True while an event is mid-apply (typically mid-animation). */
		get busy(): boolean {
			return draining
		},
		/**
		 * True while the backlog is too deep to play out, so events are being
		 * fast-forwarded onto the board.
		 *
		 * This is the honest "this client is behind the room" signal, and it exists
		 * because the obvious one stopped being trustworthy. Now that a whole turn
		 * animates, a queue with events in it is the NORMAL state during someone
		 * else's turn — a spectator watching a CPU side play is several seconds
		 * behind the log on purpose, and that is the feature. Reporting that as lag
		 * would make the diagnostics cry wolf through every turn of every match.
		 * Falling behind is specifically the case where we gave up on watching.
		 */
		get catchingUp(): boolean {
			return backlogMs(pending) > CATCHUP_BUDGET_MS
		},
		drain,
	}
}

export type EventQueue = ReturnType<typeof createEventQueue>
