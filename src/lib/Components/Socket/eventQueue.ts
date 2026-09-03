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
/**
 * How an event reached this client. `live` is a frame the acting client
 * published itself over the socket, ahead of the server recording it; such an
 * entry is provisional and carries no log id (see `QueuedEvent.provisional`).
 */
export type EventTransport = 'push' | 'poll' | 'live'

export type QueuedEvent = {
	/** `GameEvent.id` (the room's log sequence number). */
	id: number
	action: SerializedAction
	/**
	 * Whether this event is eligible for full choreography. False for catch-up and
	 * backfill, which fast-forward instantly so a reconnect doesn't replay the
	 * whole match in slow motion. Eligibility is decided when the event is
	 * accepted; whether it actually animates is decided at drain time (an event
	 * this client is running late on is fast-forwarded to keep up — see
	 * `LIVE_LAG_BUDGET_MS`).
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
	/**
	 * When this client received the event. Stamped by `push` when the caller
	 * doesn't supply one; how long it then waits for its turn is the queue's only
	 * measure of whether this client is keeping up (see `LIVE_LAG_BUDGET_MS`).
	 */
	receivedAt?: number
	/**
	 * Applied ahead of the log: the actor published it live and the server has
	 * not recorded it yet, so `id` is meaningless and the applied-id watermark
	 * must not move on it. The committed event that follows is deduped against
	 * it rather than applied twice (see GameSocket's provisional bookkeeping).
	 */
	provisional?: boolean
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
	/**
	 * Clock, so a test can drive the lag rule without spending real seconds. The
	 * queue reads it once per decision and never stores a duration, so a fake one
	 * only has to move forward.
	 */
	now?: () => number
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
 * How late an event may be and still be played out in full, measured from the
 * moment this client received it.
 *
 * Both earlier versions of this rule asked the wrong question, and each one only
 * looked wrong once the transport underneath it changed. The first counted the
 * events behind this one, so batching turned an opponent's whole turn into a
 * silent jump. The replacement measured the PLAYBACK TIME of everything queued
 * behind it against a fixed budget — and that is the version this replaces,
 * because a queue's depth is a fact about the transport, not about this client.
 *
 * Relays arrive in bursts. A client driving a CPU side produces an action, ships
 * it, and keeps playing while the request is in flight, so the next request
 * carries the run that piled up behind it. The receiver therefore gets a few
 * seconds of playback in one frame, every round trip, all through a perfectly
 * healthy match — and a few seconds of moves and attacks is enough to blow a
 * fixed playback budget on its own (a modest CPU turn projects to ~11s: six
 * relayed routes at 200ms a tile, three attacks at ~2s each). So the rule fired
 * mid-turn on a client that was in fact keeping up: it watched the first one or
 * two actions of the burst, decided it was behind, snapped the rest onto the
 * board, emptied the queue, and did it again on the next burst. The board played
 * a couple of moves and then stuttered through the rest of the turn, once per
 * turn, for the entire match.
 *
 * The honest question is not how much is queued but whether we are actually
 * running late: how long has the event at the head of the queue been sitting
 * here waiting for us? That is immune to how the transport bunches its
 * deliveries — a burst that lands in one frame and drains before the next one
 * arrives is never late, however deep it was — and it is exactly what goes wrong
 * in the cases fast-forwarding exists for: a rate-limit cooldown that held a
 * turn's worth of relays back, a backgrounded tab whose animation timers were
 * throttled to a crawl, a socket that came back with a minute of play to deliver.
 * Those all show up as an event that has been waiting seconds, and no amount of
 * bursty-but-healthy delivery does.
 *
 * The budget is set above the deepest burst a live room produces (a round trip's
 * worth of relays, plus the run they queued behind) and well under the point
 * where a watching player would rather just see the board.
 */
export const LIVE_LAG_BUDGET_MS = 6000

/**
 * Lag we have to be back under before full choreography resumes.
 *
 * Fast-forwarding is a way back to live play, not a mode, but flipping in and
 * out of it per event is what made the old rule read as a glitch rather than a
 * catch-up. Leaving it takes a real recovery, not merely dropping a millisecond
 * under the line it was crossed at.
 */
export const LIVE_LAG_RESUME_MS = 1500

/**
 * Playback time in the queue that is too much to be live play at all, whatever
 * its lag says.
 *
 * Lag alone can't see this one coming: a reconnect hands us a minute of history
 * in a single frame, and every event in it was received a moment ago, so nothing
 * is late until we have already sat through several seconds of it. This is the
 * backstop for that — deep enough that no burst a live room produces reaches it.
 */
export const BACKLOG_CEILING_MS = 30_000

/**
 * How much playback may remain before we start watching again. Applies to the
 * ceiling above, so a huge backlog is skipped down to a watchable tail rather
 * than all the way to empty — the player rejoins live play watching the board
 * move rather than mid-jump.
 */
export const BACKLOG_TAIL_MS = 6000

/**
 * Playback time of the animatable events behind this one. Stops counting once it
 * is past the ceiling: the only question is which side of the line we are on,
 * and a backlog of hundreds should not cost a full scan per event.
 */
const backlogMs = (pending: QueuedEvent[]): number => {
	let total = 0
	for (const entry of pending) {
		if (!entry.animate || !isAnimatable(entry.action)) continue
		total += remoteChoreographyMs(entry.action)
		if (total > BACKLOG_CEILING_MS) return total
	}
	return total
}

export const createEventQueue = (handlers: EventQueueHandlers) => {
	/** Accepted events, each stamped with when it arrived. */
	const pending: (QueuedEvent & { receivedAt: number })[] = []
	let draining = false
	/**
	 * Why we are fast-forwarding, if we are. Two separate reasons, because they
	 * recover differently: `late` is this client running behind the room and clears
	 * when it has caught back up; `flooded` is a single delivery too big to be live
	 * play at all and clears when it has been trimmed to a watchable tail. Both are
	 * held across events on purpose — flipping in and out of catch-up per event is
	 * what made the old rule read as a glitch rather than a catch-up.
	 */
	let late = false
	let flooded = false

	const now = (): number => handlers.now?.() ?? Date.now()

	/**
	 * Should this event skip its choreography?
	 *
	 * `late` is the live-play rule: the event at the head of the queue has been
	 * waiting longer than a watching player should be left behind the room. Bursty
	 * delivery can't trip it — a burst that drains before the next one lands never
	 * waits — so only a real stall does.
	 *
	 * `flooded` is the backstop lag cannot see: a reconnect hands us a minute of
	 * history in one frame, every event of it received a moment ago, so nothing is
	 * *late* until we have already sat through several seconds of it.
	 */
	const shouldFastForward = (entry: { receivedAt: number }): boolean => {
		const backlog = backlogMs(pending)
		if (flooded) {
			if (backlog <= BACKLOG_TAIL_MS) {
				flooded = false
				// The tail we deliberately kept is now what we are choosing to watch, so
				// stop counting the wait it spent in the flood against it — otherwise the
				// lag rule below trips part way through the tail and jumps the board a
				// second time, having already jumped it once. What bounds how far behind
				// this leaves us is the size of the tail, which is what trimmed it.
				const at = now()
				for (const queued of pending) queued.receivedAt = at
			}
		} else if (backlog > BACKLOG_CEILING_MS) {
			flooded = true
		}

		const lag = now() - entry.receivedAt
		if (late) {
			if (lag <= LIVE_LAG_RESUME_MS) late = false
		} else if (lag > LIVE_LAG_BUDGET_MS) {
			late = true
		}

		return late || flooded
	}

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
				// Animate a live move/attack unless this client is genuinely running
				// late. A burst — even a whole CPU turn's worth, which is what one
				// round trip of batched relays can carry — plays out in full as long as
				// we are keeping up with it.
				const animated = entry.animate && isAnimatable(entry.action) && !shouldFastForward(entry)
				if (animated) await handlers.animate(entry.action, entry)
				else handlers.apply(entry.action, entry)
				handlers.onApplied?.(entry, animated)
			}
			// Nothing left to be late for.
			late = false
			flooded = false
		} finally {
			draining = false
		}
	}

	return {
		/**
		 * Accept an event. It is applied from `drain`, never here.
		 *
		 * Stamped with its arrival time as it goes in: how long it then waits is the
		 * one measure of whether this client is keeping up.
		 */
		push(entry: QueuedEvent): void {
			pending.push({ ...entry, receivedAt: entry.receivedAt ?? now() })
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
		 * How long the event at the head of the queue has been waiting, which is the
		 * number the pacing rule actually decides on. Recorded on the diagnostics
		 * gauge next to the queue depth, because the two together are what say
		 * whether a deep queue is a spectator watching a turn or a client falling
		 * behind — and the depth on its own says neither.
		 */
		get lagMs(): number {
			return pending.length ? Math.max(0, now() - pending[0].receivedAt) : 0
		},
		/**
		 * True while events are being fast-forwarded onto the board because this
		 * client is behind the room.
		 *
		 * This is the honest "this client is behind" signal, and it is deliberately
		 * not "the queue has something in it". Now that a whole burst animates, a
		 * queue with events in it is the NORMAL state during someone else's turn — a
		 * spectator watching a CPU side play is a couple of seconds behind the log on
		 * purpose, and that is the feature. Reporting that as lag would make the
		 * diagnostics cry wolf through every turn of every match. Falling behind is
		 * specifically the case where we gave up on watching.
		 */
		get catchingUp(): boolean {
			return late || flooded
		},
		drain,
	}
}

export type EventQueue = ReturnType<typeof createEventQueue>
