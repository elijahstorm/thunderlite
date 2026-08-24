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
	 * with others queued behind it is fast-forwarded to keep up).
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

/** Only these two kinds have choreography worth waiting on. */
const isAnimatable = (action: SerializedAction): boolean =>
	action.kind === 'move' || action.kind === 'attack'

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
				// Animate a lone, live move/attack. When events have piled up (a burst,
				// or catching up) fast-forward instead: falling behind the room is worse
				// than missing the slide, and the state applied is identical either way.
				const animated = entry.animate && pending.length === 0 && isAnimatable(entry.action)
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
		drain,
	}
}

export type EventQueue = ReturnType<typeof createEventQueue>
