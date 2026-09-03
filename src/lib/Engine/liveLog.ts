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
 *   - `perf`   what a relay cost and how far behind the room this client is
 *
 * Entries are buffered and flushed in small batches so a match costs a handful
 * of extra requests, never one per action. Everything here is best-effort: a
 * failed flush is dropped, never retried into a queue that could grow without
 * bound, and never surfaced to the player. Logging must not be able to affect
 * the match it is observing.
 */

import { browser } from '$app/environment'
import type { SerializedAction } from './Interactor/serializedAction'

export type LiveLogKind = 'out' | 'in' | 'state' | 'chat' | 'desync' | 'note' | 'perf'

export type LiveLogEntry = {
	kind: LiveLogKind
	/** The `GameEvent.id` this entry is anchored to; -1 when it has no anchor. */
	eventId: number
	ts: number
	detail: Record<string, unknown>
}

/**
 * The trace is kept here, in the browser, for the whole match, and shipped to
 * the server ONCE when the match ends (see `archiveLiveLog`). It used to be
 * flushed every 2.5 seconds: a database row per flush per client, about as many
 * writes as the match itself, for a record one person reads afterwards. At two
 * hundred rooms that was sixteen times the project's write budget.
 *
 * What still reaches the database mid-match is evidence: a desync, a refused or
 * failed relay, a resync, the tab closing. Those flush the pending buffer the
 * moment they happen (`flush`), so a match that never reaches its end, or a
 * client that leaves before the archive goes up, still leaves the part of the
 * record that explains why. A healthy match writes nothing until it is over.
 */
/** Ceiling on the archived trace. Match 24 was ~2000 entries per client. */
const ARCHIVE_MAX = 8000
/**
 * Ceiling on the pending (not yet flushed as evidence) buffer. Also what the
 * final beacon can carry: a tab closing mid-match ships this much context.
 */
const MAX_BUFFER = 200

let session = ''
let enabled = false
/** Entries since the last evidence flush; what a flush ships. */
let buffer: LiveLogEntry[] = []
/** Everything recorded this match; what the archive ships. */
let archive: LiveLogEntry[] = []
let archived = false
let dropped = 0
let archiveDropped = 0

/**
 * Point the recorder at a room. Called once the socket layer knows it's in a
 * real online game; `''` (or a synthetic session) disables it entirely, so
 * hotseat, campaign, replay and tests never log or POST anything.
 */
export const startLiveLog = (gameSession: string): void => {
	session = gameSession
	enabled = browser && !!gameSession
	buffer = []
	archive = []
	archived = false
	dropped = 0
	archiveDropped = 0
}

/**
 * Stop recording (component teardown). If the archive already went up, the
 * record is complete and nothing more is sent. Otherwise this client is leaving
 * a match that has not ended, which is itself evidence: ship the pending buffer
 * as a beacon so the entries around the exit still land.
 */
export const stopLiveLog = (): void => {
	if (enabled && !archived) flush(true)
	enabled = false
	session = ''
}

/**
 * Ship the whole trace once, when the match is over. Idempotent per match. The
 * page is still open at game over, so this is an ordinary request and can carry
 * the full archive; the beacon path is for leaving early, and is bounded.
 */
export const archiveLiveLog = (): void => {
	if (!enabled || archived || archive.length === 0) return
	archived = true
	const body = JSON.stringify({ entries: archive, dropped: archiveDropped })
	void fetch(`/api/game/${session}/trace`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body,
	}).catch(() => {
		// Best-effort: a missing archive costs debuggability, never the match.
	})
	// Anything pending was context for evidence that never came; the archive
	// holds it now.
	buffer = []
	dropped = 0
}

const push = (kind: LiveLogKind, eventId: number, detail: Record<string, unknown>): void => {
	if (!enabled) return
	const entry: LiveLogEntry = { kind, eventId, ts: Date.now(), detail }
	archive.push(entry)
	if (archive.length > ARCHIVE_MAX) {
		archiveDropped += archive.length - ARCHIVE_MAX
		archive = archive.slice(-ARCHIVE_MAX)
	}
	buffer.push(entry)
	if (buffer.length > MAX_BUFFER) {
		dropped += buffer.length - MAX_BUFFER
		buffer = buffer.slice(-MAX_BUFFER)
	}
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

/** Force an evidence flush now (e.g. the moment a desync is detected). */
export const flushLiveLog = (): void => flush(false)

/** Relay outcomes and notes that are evidence in themselves, flushed on sight. */
const EVIDENCE_NOTES = new Set([
	'resync-requested',
	'stale-build-reload',
	'realtime-unreliable',
	'pagehide',
	'action-refused',
])

// ── Recording surface ────────────────────────────────────────────────────────

/** An action this client relayed to the server, and what the server said. */
export const logOutgoing = (
	action: SerializedAction,
	result: 'sent' | 'rejected' | 'failed',
	extra: Record<string, unknown> = {}
): void => {
	push('out', typeof extra.eventId === 'number' ? extra.eventId : -1, {
		action,
		result,
		...extra,
	})
	// A relay the room refused or that never landed is the start of a split
	// board; do not wait for the end of the match to record it.
	if (result !== 'sent') flush(false)
}

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

/**
 * A timing or backlog observation. Separate from `note` because these are the
 * entries you want to aggregate rather than read: one row per relay and per
 * gauge tick, with numbers in fixed fields so a query can take a p95 of them.
 *
 * The distinction that makes this worth recording at all is between the two
 * halves of "the game felt slow". `relayMs` and `calls` are what the round trip
 * cost; `owed` and `logLag` are how far the client had fallen behind because of
 * it. A room can have healthy round trips and a terrible `owed` — that is what a
 * client relaying a CPU side's whole turn one action at a time looks like, and
 * the latency alone would have called it fine.
 */
export const logPerf = (
	eventId: number,
	detail: {
		what: 'relay' | 'gauge'
		/** Actions in the batch, and how many the server settled. */
		actions?: number
		settled?: number
		/** Round trip as the sender measured it. */
		relayMs?: number
		/** Gateway calls the server made for it (from `x-gateway-calls`). */
		calls?: number
		gatewayMs?: number
		/** Actions this client has relayed locally but the room has not accepted. */
		owed?: number
		/** Events in the log this client has not applied yet. */
		logLag?: number
		[key: string]: unknown
	}
): void => push('perf', eventId, detail)

/** Free-form breadcrumb (connection state, resync prompts, teardown reasons). */
export const logNote = (note: string, detail: Record<string, unknown> = {}): void => {
	push('note', typeof detail.eventId === 'number' ? detail.eventId : -1, { note, ...detail })
	if (EVIDENCE_NOTES.has(note)) flush(false)
}
