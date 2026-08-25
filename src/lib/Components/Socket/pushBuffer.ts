/**
 * pushBuffer — holds realtime pushes that arrive ahead of their predecessor
 * until the hole in front of them fills.
 *
 * Events carry the room's log sequence id, so a client can always tell when one
 * has overtaken another. The socket layer used to respond to that by DROPPING
 * the push and firing a reconciliation poll to re-fetch it from the log. That is
 * correct but expensive and fragile:
 *
 *   - Two frames arriving in the wrong order — which needs nothing more than a
 *     hiccup between two publishes — cost a full HTTP round trip to resolve
 *     something the socket had already delivered.
 *   - If that poll failed (it is fire-and-forget, and a failed one is silent),
 *     nothing tried again until the next scheduled pass. With the poll throttled
 *     to one pass every 30 seconds while the socket looks connected, a player
 *     could sit watching a board that had stopped moving for half a minute and
 *     then take the whole of an opponent's turn in one lump.
 *
 * Holding the push instead makes the common case free: the reorder closes from
 * the very next frame with nothing fetched at all. A genuine loss still needs
 * the poll, and the held events are applied behind whatever it recovers, in id
 * order — which is the guarantee that matters, because applying an action ahead
 * of the move that set it up silently drops it (see `eventQueue.ts`).
 */

import type { GameEvent } from '$lib/Engine/Interactor/serializedAction'

export type PushBufferHandlers = {
	/** The last event id ACCEPTED so far (not necessarily on the board yet). */
	lastId: () => number
	/** Accept an event. Expected to advance whatever `lastId` reads. */
	accept: (event: GameEvent) => void
	/**
	 * Ceiling on held events. A socket that starts spraying ids from the far
	 * future must not be able to grow this without limit; past the cap a push is
	 * dropped and the poll recovers it like any other loss.
	 */
	max?: number
}

export type OfferResult =
	/** Applied immediately (it was the next id), along with anything behind it. */
	| 'accepted'
	/** Held: there is a hole in front of it. */
	| 'held'
	/** Already have it. */
	| 'stale'
	/** There is a hole in front of it and the buffer is full. */
	| 'dropped'

export const createPushBuffer = ({ lastId, accept, max = 64 }: PushBufferHandlers) => {
	const held = new Map<number, GameEvent>()

	const drain = (): void => {
		// Whatever the poll already covered is redundant now.
		for (const id of held.keys()) if (id <= lastId()) held.delete(id)
		for (;;) {
			const next = held.get(lastId() + 1)
			if (!next) return
			held.delete(next.id)
			const before = lastId()
			accept(next)
			// A refused accept (no board yet) leaves `lastId` where it was. Stop
			// rather than spin; the poll re-fetches from the same place.
			if (lastId() === before) return
		}
	}

	return {
		offer(event: GameEvent): OfferResult {
			if (event.id <= lastId()) return 'stale'
			if (event.id === lastId() + 1) {
				accept(event)
				drain()
				return 'accepted'
			}
			if (held.size >= max) return 'dropped'
			held.set(event.id, event)
			return 'held'
		},
		drain,
		/** Events held behind a hole. Non-zero means this client knows it is behind. */
		get size(): number {
			return held.size
		},
	}
}

export type PushBuffer = ReturnType<typeof createPushBuffer>
