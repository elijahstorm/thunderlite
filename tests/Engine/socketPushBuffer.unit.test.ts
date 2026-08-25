// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createPushBuffer } from '../../src/lib/Components/Socket/pushBuffer'
import type { GameEvent } from '../../src/lib/Engine/Interactor/serializedAction'

const evt = (id: number): GameEvent => ({ id, action: { kind: 'wait', tile: id } }) as GameEvent

/**
 * Mirrors the socket layer: `accept` is what advances the client's notion of the
 * last event it has taken in, exactly as `applyEvent` does.
 */
const harness = (max?: number) => {
	const accepted: number[] = []
	let lastId = -1
	const buffer = createPushBuffer({
		lastId: () => lastId,
		accept: (event) => {
			accepted.push(event.id)
			lastId = event.id
		},
		max,
	})
	return {
		accepted,
		buffer,
		seek: (id: number) => (lastId = id),
		get lastId() {
			return lastId
		},
	}
}

describe('socket push buffer', () => {
	it('applies pushes that arrive in order', () => {
		const { accepted, buffer } = harness()

		expect(buffer.offer(evt(0))).toBe('accepted')
		expect(buffer.offer(evt(1))).toBe('accepted')
		expect(accepted).toEqual([0, 1])
		expect(buffer.size).toBe(0)
	})

	/**
	 * The reordering case, which used to cost a full poll round trip: the socket
	 * delivered both frames, just the wrong way round. Nothing needs fetching —
	 * the hole closes from the very next frame, and the held event goes on the
	 * board BEHIND the one it overtook, never in front of it.
	 */
	it('holds a push that overtook its predecessor and applies it behind it', () => {
		const { accepted, buffer } = harness()

		buffer.offer(evt(0))
		expect(buffer.offer(evt(2))).toBe('held')
		expect(accepted).toEqual([0])
		expect(buffer.size).toBe(1)

		expect(buffer.offer(evt(1))).toBe('accepted')
		expect(accepted).toEqual([0, 1, 2])
		expect(buffer.size).toBe(0)
	})

	it('drains a whole run of held pushes once the hole fills', () => {
		const { accepted, buffer } = harness()

		buffer.offer(evt(0))
		buffer.offer(evt(4))
		buffer.offer(evt(3))
		buffer.offer(evt(2))
		expect(accepted).toEqual([0])

		buffer.offer(evt(1))
		expect(accepted).toEqual([0, 1, 2, 3, 4])
	})

	/**
	 * The genuine-loss case. The push for event 1 is never delivered at all, so the
	 * poll fetches it out of the log; `drain` is what puts the held events on the
	 * board behind it instead of leaving them stranded until another push arrives.
	 */
	it('drains behind events the poll recovered', () => {
		const { accepted, buffer, seek } = harness()

		buffer.offer(evt(0))
		buffer.offer(evt(2))
		buffer.offer(evt(3))

		// The poll applies event 1 through the same path the socket would have.
		accepted.push(1)
		seek(1)
		buffer.drain()

		expect(accepted).toEqual([0, 1, 2, 3])
		expect(buffer.size).toBe(0)
	})

	it('discards held pushes the poll already covered', () => {
		const { accepted, buffer, seek } = harness()

		buffer.offer(evt(0))
		buffer.offer(evt(3))
		expect(buffer.size).toBe(1)

		// A poll pulled the whole tail out of the log, event 3 included.
		seek(5)
		buffer.drain()

		expect(accepted).toEqual([0])
		expect(buffer.size).toBe(0)
	})

	it('reports an event it already has as stale rather than reapplying it', () => {
		const { accepted, buffer } = harness()

		buffer.offer(evt(0))
		expect(buffer.offer(evt(0))).toBe('stale')
		expect(accepted).toEqual([0])
	})

	it('drops rather than holds past its ceiling, leaving recovery to the poll', () => {
		const { buffer } = harness(2)

		buffer.offer(evt(0))
		expect(buffer.offer(evt(5))).toBe('held')
		expect(buffer.offer(evt(6))).toBe('held')
		expect(buffer.offer(evt(7))).toBe('dropped')
		expect(buffer.size).toBe(2)
	})

	/** No board yet: `accept` refuses, `lastId` stays put, and drain must not spin. */
	it('stops draining when an accept does not take', () => {
		const buffer = createPushBuffer({ lastId: () => -1, accept: () => {} })

		buffer.offer(evt(1))
		buffer.offer(evt(0))
		expect(buffer.size).toBe(1)
	})
})
