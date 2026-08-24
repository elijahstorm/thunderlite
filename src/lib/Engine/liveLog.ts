/**
 * liveLog — a recorder for what actually happened on THIS client during an
 * online match, shipped to the server so a broken game can be reconstructed
 * afterwards instead of reasoned about from a bug report.
 *
 * The `game_event` log already records what the *server* was told. What it can't
 * show is the part that goes wrong: which client received which event, over
 * which transport, in what order, whether it animated or was applied instantly,
 * whether it was dropped — and what each client's board looked like afterwards.
 * That asymmetry is exactly how a desync hides: both clients agree on the action
 * list and still end up with different boards.
 *
 * So every client in an online room records, per entry:
 *   - `out`    an action this client relayed to the server (and how that went)
 *   - `in`     an event this client received (id, transport, disposition)
 *   - `state`  a board digest anchored to an event id — the desync detector
 *   - `chat`   an in-game chat line (realtime-only, so otherwise unrecorded)
 *   - `desync` an action the engine could not apply (see `desync.ts`)
 *
 * Entries are buffered and flushed in small batches so a match costs a handful
 * of extra requests, never one per action. Everything here is best-effort: a
 * failed flush is dropped, never retried into a queue that could grow without
 * bound, and never surfaced to the player. Logging must not be able to affect
 * the match it is observing.
 */

import { browser } from '$app/environment'
import type { SerializedAction } from './Interactor/serializedAction'

export type LiveLogKind = 'out' | 'in' | 'state' | 'chat' | 'desync' | 'note'

export type LiveLogEntry = {
	kind: LiveLogKind
	/** The `GameEvent.id` this entry is anchored to; -1 when it has no anchor. */
	eventId: number
	ts: number
	detail: Record<string, unknown>
}

/** Flush window. Long enough to batch a burst of a turn's actions into one POST. */
const FLUSH_DELAY_MS = 2500
/** Flush immediately once the buffer reaches this, so a busy turn isn't held. */
const FLUSH_AT = 25
/**
 * Hard ceiling on the pending buffer. A client that loses the network for a long
 * stretch drops its OLDEST entries rather than growing without bound — the recent
 * ones are the ones that explain what just went wrong.
 */
const MAX_BUFFER = 200

let session = ''
let enabled = false
let buffer: LiveLogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let dropped = 0

/**
 * Point the recorder at a room. Called once the socket layer knows it's in a
 * real online game; `''` (or a synthetic session) disables it entirely, so
 * hotseat, campaign, replay and tests never log or POST anything.
 */
export const startLiveLog = (gameSession: string): void => {
	session = gameSession
	enabled = browser && !!gameSession
	buffer = []
	dropped = 0
	if (flushTimer) {
		clearTimeout(flushTimer)
		flushTimer = null
	}
}

/** Flush what's pending and stop recording (component teardown / match over). */
export const stopLiveLog = (): void => {
	if (enabled) flush(true)
	enabled = false
	session = ''
}

const scheduleFlush = (): void => {
	if (flushTimer) return
	flushTimer = setTimeout(() => {
		flushTimer = null
		flush(false)
	}, FLUSH_DELAY_MS)
}

const push = (kind: LiveLogKind, eventId: number, detail: Record<string, unknown>): void => {
	if (!enabled) return
	buffer.push({ kind, eventId, ts: Date.now(), detail })
	if (buffer.length > MAX_BUFFER) {
		dropped += buffer.length - MAX_BUFFER
		buffer = buffer.slice(-MAX_BUFFER)
	}
	if (buffer.length >= FLUSH_AT) flush(false)
	else scheduleFlush()
}

/**
 * Ship the buffer. `final` uses `sendBeacon` where available so a flush started
 * as the tab closes still lands — that's the flush most likely to hold the
 * entries explaining why the player left.
 */
const flush = (final: boolean): void => {
	if (!enabled || buffer.length === 0) return
	const entries = buffer
	buffer = []
	const skipped = dropped
	dropped = 0
	const body = JSON.stringify({ entries, dropped: skipped })
	const url = `/api/game/${session}/log`
	if (final && typeof navigator !== 'undefined' && navigator.sendBeacon) {
		try {
			navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
			return
		} catch {
			// Beacon unavailable or over its size cap — fall through to fetch.
		}
	}
	void fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body,
		keepalive: final,
	}).catch(() => {
		// Best-effort by design: a lost batch costs debuggability, never the match.
	})
}

/** Force a flush now (e.g. the moment a desync is detected). */
export const flushLiveLog = (): void => flush(false)

// ── Recording surface ────────────────────────────────────────────────────────

/** An action this client relayed to the server, and what the server said. */
export const logOutgoing = (
	action: SerializedAction,
	result: 'sent' | 'rejected' | 'failed',
	extra: Record<string, unknown> = {}
): void =>
	push('out', typeof extra.eventId === 'number' ? extra.eventId : -1, {
		action,
		result,
		...extra,
	})

/**
 * An event this client received. `via` distinguishes the realtime push from the
 * reconciliation poll, and `disposition` records what we did with it — the two
 * fields that together expose an ordering bug.
 */
export const logIncoming = (
	eventId: number,
	action: SerializedAction,
	via: 'push' | 'poll',
	disposition: 'queued' | 'applied' | 'animated' | 'deduped' | 'stale' | 'no-map'
): void => push('in', eventId, { action, via, disposition })

/**
 * A board fingerprint anchored to an event id. Two clients reporting different
 * digests for the same id have diverged; the last id they agreed on is where.
 */
export const logState = (
	eventId: number,
	digest: { digest: string; units: number; buildings: number; turn: number; team: number },
	label: string
): void => push('state', eventId, { ...digest, label })

/** An in-game chat line. Realtime-only, so nothing else records these. */
export const logChat = (source: string, message: string, outgoing: boolean): void =>
	push('chat', -1, { source, message, outgoing })

/** An action the engine refused to apply — see `desync.ts`. */
export const logDesync = (
	eventId: number,
	action: SerializedAction,
	reason: string,
	snapshot?: string
): void => {
	push('desync', eventId, { action, reason, snapshot })
	// Never sit on this one behind the batch window: the tab may be about to be
	// reloaded (by the player, or by the resync prompt) and take the buffer with it.
	flush(false)
}

/** Free-form breadcrumb (connection state, resync prompts, teardown reasons). */
export const logNote = (note: string, detail: Record<string, unknown> = {}): void =>
	push('note', typeof detail.eventId === 'number' ? detail.eventId : -1, { note, ...detail })
