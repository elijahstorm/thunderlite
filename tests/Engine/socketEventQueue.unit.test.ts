// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CATCHUP_BUDGET_MS, createEventQueue } from '../../src/lib/Components/Socket/eventQueue'
import { remoteChoreographyMs } from '../../src/lib/Engine/remoteChoreography'
import type { SerializedAction } from '../../src/lib/Engine/Interactor/serializedAction'

const deferred = () => {
	let resolve!: () => void
	const promise = new Promise<void>((r) => (resolve = r))
	return { promise, resolve }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * A harness that records the ORDER in which the board is actually touched, which
 * is the only thing these tests care about. `animate` blocks until released, so a
 * test can hold an event mid-slide and push more behind it — the exact race that
 * used to lose an attack in live play.
 */
const label = (action: SerializedAction): string => JSON.stringify(action)

const harness = (ready = () => true) => {
	const log: string[] = []
	const gates: ReturnType<typeof deferred>[] = []
	const queue = createEventQueue({
		ready,
		animate: async (action) => {
			log.push(`animate:start:${label(action)}`)
			const gate = deferred()
			gates.push(gate)
			await gate.promise
			log.push(`animate:done:${label(action)}`)
		},
		apply: (action) => log.push(`apply:${label(action)}`),
		onApplied: (entry) => log.push(`applied:${entry.id}`),
		onDropped: (entry) => log.push(`dropped:${entry.id}`),
	})
	return { log, gates, queue }
}

/**
 * Let the queue run to a standstill, releasing each animation gate as it opens.
 * `animate` in the harness blocks, so a backlog can only be drained by resolving
 * the gates one at a time.
 */
const drain = async (gates: ReturnType<typeof deferred>[], rounds = 200) => {
	for (let i = 0; i < rounds; i++) {
		const open = gates.length
		gates.forEach((gate) => gate.resolve())
		await flush()
		if (gates.length === open) return
	}
}

const move = (from: number, to: number): SerializedAction => ({ kind: 'move', from, to })
const attack = (from: number, to: number): SerializedAction => ({ kind: 'attack', from, to })

describe('socket event queue', () => {
	/**
	 * The regression this file exists for. A tank moves out of the fog and attacks.
	 * The move arrives over the realtime push and starts animating; the follow-up
	 * attack arrives over the reconciliation poll while the slide is still playing.
	 *
	 * The poll used to apply straight to the board, so the attack landed while the
	 * mover was lifted off its source tile and on no tile at all — `applyAttack`
	 * found no attacker, returned, and the attack was gone for good. One player saw
	 * the hit; the other saw the tank roll up and do nothing.
	 */
	it('never applies a polled event while an earlier one is still animating', async () => {
		const { log, gates, queue } = harness()

		queue.push({ id: 1, action: move(10, 12), animate: true, live: true, via: 'push' })
		await flush()
		expect(log).toEqual([`animate:start:${label(move(10, 12))}`])

		// Mid-slide: the poll delivers the attack that follows the move.
		queue.push({ id: 2, action: attack(12, 13), animate: false, live: true, via: 'poll' })
		await flush()

		// It must NOT have touched the board yet.
		expect(log).toEqual([`animate:start:${label(move(10, 12))}`])
		expect(queue.size).toBe(1)

		// Slide lands; only now does the attack apply — against a board that has the
		// mover on its destination tile.
		gates[0].resolve()
		await flush()

		expect(log).toEqual([
			`animate:start:${label(move(10, 12))}`,
			`animate:done:${label(move(10, 12))}`,
			'applied:1',
			`apply:${label(attack(12, 13))}`,
			'applied:2',
		])
	})

	it('applies events in accepted order regardless of which transport delivered them', async () => {
		const { log, queue } = harness()

		queue.push({ id: 1, action: move(1, 2), animate: false, live: false, via: 'poll' })
		queue.push({ id: 2, action: attack(2, 3), animate: false, live: false, via: 'push' })
		queue.push({ id: 3, action: move(4, 5), animate: false, live: false, via: 'poll' })
		await flush()

		expect(log.filter((l) => l.startsWith('applied'))).toEqual([
			'applied:1',
			'applied:2',
			'applied:3',
		])
	})

	/**
	 * A whole CPU side's turn arrives as ONE batch now that relays are batched, so
	 * this is the case the pacing rule is really about. Play order and the moves
	 * themselves are what a watching player is there for — a board that
	 * rearranges itself in one silent jump does not tell them what the opponent
	 * did. Every step of a turn-sized run must animate.
	 */
	it('plays out a whole turn that arrives at once', async () => {
		const { log, gates, queue } = harness()

		// Fifteen moves is a plausible CPU turn: ~6s of playback, inside the budget.
		const turn = Array.from({ length: 15 }, (_, i) => move(i + 1, i + 2))
		turn.forEach((action, i) =>
			queue.push({ id: i + 1, action, animate: true, live: true, via: 'push' })
		)
		await drain(gates)

		for (const action of turn) {
			expect(log).toContain(`animate:start:${label(action)}`)
			expect(log).not.toContain(`apply:${label(action)}`)
		}
	})

	it('fast-forwards a backlog too deep to be worth watching', async () => {
		const { log, gates, queue } = harness()

		// What a lost network or a throttled background tab leaves behind: minutes
		// of playback. Making someone sit through that before they can act is worse
		// than skipping it, so the front of the queue applies instantly.
		const backlog = Array.from({ length: 40 }, (_, i) => move(i + 1, i + 2))
		backlog.forEach((action, i) =>
			queue.push({ id: i + 1, action, animate: true, live: true, via: 'push' })
		)
		await drain(gates)

		// The first event out of the queue had nothing behind it yet, so it animates
		// — the backlog only exists from the second one on, which is where the
		// fast-forward has to bite.
		expect(log).toContain(`apply:${label(backlog[1])}`)
		expect(log).not.toContain(`animate:start:${label(backlog[1])}`)
		// What bounds how much plays out is the BUDGET, not the size of the backlog:
		// however deep it gets, the player watches about the same tail of it. Stated
		// in terms of the real numbers so retuning either one retunes this with it
		// (+1 for the event that dequeued before the rest had arrived).
		const animated = log.filter((line) => line.startsWith('animate:start')).length
		const affordable = Math.ceil(CATCHUP_BUDGET_MS / remoteChoreographyMs(backlog[0])) + 1
		expect(animated).toBeLessThanOrEqual(affordable)
		expect(animated).toBeLessThan(backlog.length)
	})

	/**
	 * And it must come back. Fast-forwarding is a way to catch up, not a mode: once
	 * what is left fits the budget the tail plays out, so the player rejoins live
	 * play watching the board move rather than mid-jump.
	 */
	it('resumes animating once the remaining backlog fits again', async () => {
		const { log, gates, queue } = harness()

		const backlog = Array.from({ length: 40 }, (_, i) => move(i + 1, i + 2))
		backlog.forEach((action, i) =>
			queue.push({ id: i + 1, action, animate: true, live: true, via: 'push' })
		)
		await drain(gates)

		const last = backlog[backlog.length - 1]
		expect(log).toContain(`animate:start:${label(last)}`)
		expect(log).not.toContain(`apply:${label(last)}`)
	})

	/**
	 * The original complaint, kept because it is the floor of the behaviour: the
	 * first version of this rule animated an event only when it was ALONE in the
	 * queue, so a player taking their turn in quick succession had every move but
	 * the last teleported.
	 */
	it('still plays out a short bunch rather than jumping the board', async () => {
		const { log, gates, queue } = harness()

		queue.push({ id: 1, action: move(1, 2), animate: true, live: true, via: 'push' })
		await flush()
		queue.push({ id: 2, action: move(2, 3), animate: true, live: true, via: 'push' })
		queue.push({ id: 3, action: move(3, 4), animate: true, live: true, via: 'push' })

		gates[0].resolve()
		await flush()

		expect(log).toContain(`animate:start:${label(move(2, 3))}`)
		expect(log).not.toContain(`apply:${label(move(2, 3))}`)
	})

	it('never animates a catch-up backlog', async () => {
		const { log, queue } = harness()

		queue.push({ id: 1, action: move(1, 2), animate: false, live: false, via: 'poll' })
		await flush()

		expect(log).toEqual([`apply:${label(move(1, 2))}`, 'applied:1'])
	})

	it('applies a kind with no choreography instantly', async () => {
		const { log, queue } = harness()

		queue.push({ id: 1, action: { kind: 'end-turn' }, animate: true, live: true, via: 'push' })
		await flush()

		expect(log).toEqual([`apply:${label({ kind: 'end-turn' })}`, 'applied:1'])
	})

	/**
	 * A repair HAS an animation — its health bar eases up, exactly as it does for
	 * the player who ordered it — but the queue used to keep its own `move ||
	 * attack` list and never called the animator for one. The watching opponent
	 * just saw the HP snap to its new value. The list now comes from
	 * `hasRemoteChoreography`, the same source `animateRemoteAction` describes
	 * itself with, so the two can't drift apart again.
	 */
	it('animates a repair rather than snapping the health bar', async () => {
		const { log, gates, queue } = harness()
		const repair = { kind: 'repair' as const, tile: 8 }

		queue.push({ id: 1, action: repair, animate: true, live: true, via: 'push' })
		await flush()

		expect(log).toEqual([`animate:start:${label(repair)}`])
		gates[0].resolve()
		await flush()
		expect(log).not.toContain(`apply:${label(repair)}`)
	})

	it('drops events (loudly) when the board has gone away', async () => {
		const { log, queue } = harness(() => false)

		queue.push({ id: 7, action: move(1, 2), animate: true, live: true, via: 'push' })
		await flush()

		expect(log).toEqual(['dropped:7'])
	})

	it('picks up events pushed while a drain is already in flight', async () => {
		const { log, gates, queue } = harness()

		queue.push({ id: 1, action: attack(1, 2), animate: true, live: true, via: 'push' })
		await flush()
		expect(queue.busy).toBe(true)

		queue.push({ id: 2, action: { kind: 'wait', tile: 3 }, animate: true, live: true, via: 'push' })
		gates[0].resolve()
		await flush()

		expect(log.filter((l) => l.startsWith('applied'))).toEqual(['applied:1', 'applied:2'])
		expect(queue.busy).toBe(false)
		expect(queue.size).toBe(0)
	})

	/**
	 * The commit handlers get the whole entry, not just the action, so the caller
	 * can tell an event that arrived as LIVE play from one it pulled out of the log
	 * on the way in.
	 *
	 * That distinction is load-bearing, and match 13 is why. A player's opening
	 * moves never reached the log, so the moves that followed them were unapplyable
	 * for everybody — and the desync banner fired on the catch-up replay just as
	 * loudly as on live divergence. It therefore came straight back on every
	 * reload and never left, telling two players who had by then replayed the same
	 * log and were byte-for-byte in sync that they were out of sync. A hole in the
	 * shared log is not a divergence between clients; only the live case is.
	 */
	it('hands the commit handlers the entry, so replay is distinguishable from live', async () => {
		const seen: { id: number; live: boolean }[] = []
		const queue = createEventQueue({
			ready: () => true,
			animate: async (_action, entry) => {
				seen.push({ id: entry.id, live: entry.live })
			},
			apply: (_action, entry) => {
				seen.push({ id: entry.id, live: entry.live })
			},
		})

		// A catch-up replay out of the log, then a live push behind it.
		queue.push({ id: 1, action: move(1, 2), animate: false, live: false, via: 'poll' })
		queue.push({ id: 2, action: move(2, 3), animate: true, live: true, via: 'push' })
		await flush()

		expect(seen).toEqual([
			{ id: 1, live: false },
			{ id: 2, live: true },
		])
	})
})
