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

import { get, writable } from 'svelte/store'
import type { SerializedAction } from './Interactor/serializedAction'

export type DesyncReason =
	| 'missing-attacker'
	| 'missing-target'
	| 'missing-unit'
	| 'missing-building'
	| 'missing-mover'
	// Not an engine bail-out: the online layer could not get an action this client
	// has ALREADY applied into the room's log. Same divergence, opposite direction —
	// here we are the one holding state nobody else will ever see.
	| 'action-refused'
	| 'action-lost'

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

/**
 * Whether gameplay input is frozen because this client's board is known to
 * disagree with the room.
 *
 * A report on its own is a diagnosis; this is the treatment. Once the boards
 * differ, every further action is taken against a board nobody else has: it
 * either gets refused by the server (and vanishes) or gets recorded against
 * state the room never reached (and corrupts the log for everyone). Match 13 is
 * the worked example — one player kept commanding units the room had never
 * moved, so the opponent walked onto "occupied" tiles and the phantom units
 * blinked out. Freezing is the only honest response: the player stops writing
 * history that cannot be reconciled, and is told to resync.
 *
 * ONLY the online layer (`GameSocket`) sets this. Local, hotseat, campaign and
 * replay attach no listener and never lock, so nothing off the network path
 * changes behaviour. Surrender is deliberately never gated on it: giving up is
 * always available, and the server attributes it to the sender's own team.
 */
export const syncLocked = writable(false)

/** Freeze gameplay input. Cleared only by a resync (a reload) or a new match. */
export const lockGameplayForDesync = (): void => syncLocked.set(true)

/** Guard for the input funnels — cheap enough to call on every click. */
export const isSyncLocked = (): boolean => get(syncLocked)

/** Fresh match: forget anything the previous board reported. */
export const resetDesync = (): void => {
	desyncReports.set(null)
	desyncCount.set(0)
	syncLocked.set(false)
}
