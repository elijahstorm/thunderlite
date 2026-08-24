/**
 * desync — the engine's "this action referred to something that isn't there"
 * alarm.
 *
 * `applyAction` is written defensively: nearly every case starts by reading the
 * unit or building the action names and bails out if it's missing. That is the
 * right call for replay and for headless simulation, where a stale action must
 * not throw. In ONLINE play it is exactly the failure mode that ruins matches:
 * an attack whose attacker tile is empty on this client is dropped in silence,
 * the target keeps HP it should have lost, and from that point on the two
 * players are running different games — every later kill, capture and build
 * compounding the gap with nothing to notice it.
 *
 * So the bail-outs now report instead of just returning. Nothing in the engine
 * changes behaviour (the action is still skipped — there is no coherent state to
 * apply it to); the report is a side channel the online layer listens on so it
 * can log the divergence and offer the player a resync. Local, campaign and
 * replay play simply have no listener attached, so it stays a no-op there.
 */

import { writable } from 'svelte/store'
import type { SerializedAction } from './Interactor/serializedAction'

export type DesyncReason =
	'missing-attacker' | 'missing-target' | 'missing-unit' | 'missing-building' | 'missing-mover'

export type DesyncReport = {
	action: SerializedAction
	reason: DesyncReason
	/** Wall clock, so a report can be lined up against the network log. */
	ts: number
}

/**
 * Latest report, or null. A store rather than a callback so several consumers
 * (the network logger, a UI banner) can watch the same signal, and so a match
 * with no online layer attached costs one `set` and nothing else.
 */
export const desyncReports = writable<DesyncReport | null>(null)

/** Monotonic count of reports this session — cheap "has anything gone wrong". */
export const desyncCount = writable(0)

export const reportDesync = (action: SerializedAction, reason: DesyncReason): void => {
	desyncReports.set({ action, reason, ts: Date.now() })
	desyncCount.update((n) => n + 1)
}

/** Fresh match: forget anything the previous board reported. */
export const resetDesync = (): void => {
	desyncReports.set(null)
	desyncCount.set(0)
}
