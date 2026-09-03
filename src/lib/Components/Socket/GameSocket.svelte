<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte'
	import { browser } from '$app/environment'
	import { updated } from '$app/state'
	import LocalInteracter from '$lib/Engine/Interactor/LocalInteracter.svelte'
	import {
		actionFingerprint,
		dispatchSerializedAction,
		normalizeAction,
		type GameEvent,
		type SerializedAction,
	} from '$lib/Engine/Interactor/serializedAction'
	import { animateRemoteAction } from '$lib/Engine/remoteAnimate'
	import { createEventQueue } from './eventQueue'
	import { createPushBuffer } from './pushBuffer'
	import { outgoingActions } from '$lib/Engine/outgoingActions'
	import {
		desyncReports,
		lockGameplayForDesync,
		reportDesync,
		resetDesync,
		syncLocked,
	} from '$lib/Engine/desync'
	import { boardDigestDetail, boardSnapshot } from '$lib/Engine/boardDigest'
	import {
		logDesync,
		logIncoming,
		logNote,
		logOutgoing,
		logPerf,
		logState,
		startLiveLog,
		stopLiveLog,
	} from '$lib/Engine/liveLog'
	import { RealtimeConnection, type RealtimeMessage } from '$lib/dontcode/realtimeClient'
	import { formatTimeLeft } from '$lib/Game/asyncConfig'
	import { noteServiceBusy } from '$lib/Stores/serviceHealth'
	import { addToast } from 'as-toast'
	import { fly } from 'svelte/transition'

	interface Props {
		map: () => MapObject | undefined
		gameSession?: string
		userSession?: string
		/** Async (correspondence) room: show the turn clock and skip live-only UX. */
		asyncGame?: boolean
		/** Initial turn deadline from the loader; the event poll keeps it fresh. */
		turnDeadline?: number | null
		/** Initial CPU-seat wiring from the loader; the event poll keeps it fresh
		 * (the driver can change mid-match when a human is swept for absence). */
		aiTeams?: number[]
		isAiDriver?: boolean
		children?: import('svelte').Snippet<[any]>
	}

	let {
		map,
		gameSession = '',
		userSession = '',
		asyncGame = false,
		turnDeadline = null,
		aiTeams = [],
		isAiDriver = false,
		children,
	}: Props = $props()

	const POLL_INTERVAL = 1500
	// With a live websocket that is demonstrably delivering, polling drops to a
	// slow reconciliation pass that only exists to catch a push the fire-and-forget
	// channel lost. `pushTrusted` is what decides whether it has earned that: the
	// moment a poll turns up an event the socket never pushed, we go back to the
	// fast interval (see `notePushMiss`).
	// Default 20 ticks (30s). The server can stretch it: every poll response
	// carries `pollAfterMs`, derived from how much of the shared budget is left,
	// and a room under pressure polls at 60 or 120s instead. Realtime is carrying
	// the match, so nobody notices, which is the whole idea of degrading here.
	let connectedPollTicks = 20
	// A push that overtakes its predecessor is held here until the hole in front of
	// it fills, rather than being thrown away and re-fetched. Bounded so a socket
	// that starts spraying ids from the far future can't grow this without limit.
	const MAX_HELD_PUSHES = 64
	// Presence is asked for, never reported. Nothing pings while the room is
	// moving; only once it has been quiet this long does the client ask the server
	// who still holds a socket, and it keeps asking at this cadence until something
	// happens. A player thinking for two minutes is not a stall to the server,
	// because they are still present. Only a socket that has been gone for the
	// whole grace window (across two checks) is resigned. Longer than any idle gap
	// in a real match (match 24's longest was 30s), so a healthy room never asks.
	const STALL_CHECK_MS = 90_000
	/**
	 * Most actions one request may carry. Matches the server's own cap; a run
	 * longer than this simply continues in the next request.
	 */
	// A whole turn, held and relayed at the handover (see `pumpRelay`). Mirrors
	// the server's MAX_RUN_ACTIONS; a longer turn goes out in two runs.
	const MAX_RELAY_BATCH = 64
	// Client publishes are capped by the realtime service at 25 frames a second
	// per socket, and a CPU turn arrives all at once. Live frames leave through a
	// small pacer that stays under that.
	const LIVE_FRAME_GAP_MS = 50
	/**
	 * How often the backlog gauges are recorded while this client is behind the
	 * room. Only ticks that have something to say are written (see `gaugeTick`),
	 * so a healthy match costs nothing.
	 */
	const GAUGE_INTERVAL = 5000

	const isMultiplayer = (): boolean => {
		if (!gameSession) return false
		if (gameSession === 'ephemeral') return false
		if (gameSession === 'testSession') return false
		return true
	}

	let multiplayer = $state(false)
	let lastEventId = -1
	let pollTimer: ReturnType<typeof setInterval> | null = null
	let stallTimer: ReturnType<typeof setInterval> | null = null
	/** When this client last saw the room move: an event in, or its own relay out. */
	let lastActivityAt = Date.now()
	/** Teams we have already told the user we are waiting on. Not rendered. */
	let waitingNoticed: number[] = []
	let pollTick = 0
	let realtimeConn: RealtimeConnection | null = null
	let realtimeUp = false
	/**
	 * Whether the socket is actually delivering, as opposed to merely being open.
	 *
	 * `realtimeUp` only tracks the WebSocket's own lifecycle. A connection can be
	 * open and useless — the server's publish is best-effort and swallows its
	 * failures, a frame can be dropped in the gateway, and a socket wedged by a
	 * dead NAT binding never fires `onclose` at all. In every one of those cases
	 * `realtimeUp` stays true and the poll stays throttled to one pass every 30
	 * seconds, which is how an opponent's whole turn can go unseen and then land
	 * in one lump.
	 *
	 * So the poll reports on the socket. Any fresh event the poll has to fetch is
	 * one the push never delivered; that drops trust and restores fast polling
	 * until a push arrives in order and earns it back. The bias is deliberate:
	 * when in doubt, poll.
	 */
	let pushTrusted = true
	/**
	 * Live frames: the acting client publishes each of its own actions over the
	 * socket the moment it takes them, so the room watches the turn play out while
	 * the durable relay waits for the handover. Frames are keyed `sender:turn`
	 * with a running index, so a receiver can tell a lost frame from a late one.
	 *
	 * What a receiver applies from a live frame is PROVISIONAL: on the board, but
	 * not yet in the log. The committed event that follows (push or poll) is
	 * deduped against it in order, and the applied-id watermark moves then. A
	 * lost live frame does not desync anything: the receiver stops applying live
	 * frames for the rest of that turn and takes the remainder from the log.
	 */
	let liveTurn = Math.floor(Math.random() * 1_000_000)
	let liveIndex = 0
	const liveOutbox: unknown[] = []
	let liveDrainTimer: ReturnType<typeof setTimeout> | null = null
	/** Fingerprints of provisional actions this client has queued, oldest first. */
	const provisional: string[] = []
	/** Provisional entries already on the board whose committed event has not arrived. */
	let provisionalApplied = 0
	/** Committed ids that arrived before their provisional entry left the queue. */
	const committedIds: number[] = []
	/** Where the current live turn stands: who, which turn, next index, and whether a frame went missing. */
	let liveIncoming: { key: string; nextIndex: number; gap: boolean } | null = null
	let outgoingUnsubscribe: (() => void) | null = null
	let requestRedraw: number = $state(0)
	let wrongTurn = $state(false)
	let wrongTurnTimer: ReturnType<typeof setTimeout> | null = null
	/**
	 * One dedupe slot per action this client relayed and has not yet heard back
	 * about. The echo of our own action comes back around the room like anyone
	 * else's, and re-applying it would double the move.
	 *
	 * This used to be a Set of action fingerprints, which was wrong in two ways
	 * that both get worse the laggier the socket is. A `SerializedAction` carries
	 * no actor — `{kind:'capture',tile:40}` is byte-identical whoever performed it
	 * — and a Set collapses duplicates, so two identical actions in flight shared
	 * one slot. Worse, the slot was only ever released by the echo arriving through
	 * `applyEvent`, and it usually doesn't: `relayOnce` advances `lastEventId` past
	 * our own event the moment the POST answers, so the echo behind it is skipped
	 * as stale and the fingerprint stayed in the Set forever. A match therefore
	 * accumulated one permanent entry per action taken — and the next time the
	 * OPPONENT captured that same tile, or walked that same from/to, their action
	 * was silently swallowed as "ours". That is a real divergence, it never heals,
	 * and it is likeliest exactly when the HTTP response beats the push.
	 *
	 * A slot now belongs to one relay, is consumed by whichever of the two arrives
	 * first, and is always released when the relay settles.
	 */
	type SelfRelay = { fingerprint: string }
	const pendingSelf: SelfRelay[] = []

	/** Consume the oldest outstanding slot for this action, if we own one. */
	const claimSelf = (fingerprint: string): boolean => {
		const index = pendingSelf.findIndex((slot) => slot.fingerprint === fingerprint)
		if (index === -1) return false
		pendingSelf.splice(index, 1)
		return true
	}

	const releaseSelf = (slot: SelfRelay) => {
		const index = pendingSelf.indexOf(slot)
		if (index !== -1) pendingSelf.splice(index, 1)
	}

	// Async turn clock: the deadline the current player must END their turn by.
	// Seeded from the loader (initial value only — polls own it after that),
	// refreshed by every poll/move response; a ticker re-renders the countdown.
	let deadline: number | null = $state(untrack(() => turnDeadline))
	// CPU seats and whether WE run them. Seeded from the loader, then owned by the
	// poll: the lowest-seat human drives the AI, and that seat can change during
	// the match (the absence sweep removes a player who left). Without the refresh
	// a board with CPU sides can end up with no driver at all and stall on the
	// AI's turn — the same deadlock as a side with no member.
	let liveAiTeams = $state(untrack(() => aiTeams))
	let liveIsAiDriver = $state(untrack(() => isAiDriver))
	let clockNow = $state(Date.now())
	let clockTimer: ReturnType<typeof setInterval> | null = null
	let gaugeTimer: ReturnType<typeof setInterval> | null = null
	const deadlineLeftMs = $derived(deadline != null ? deadline - clockNow : null)

	// The last event id actually committed to the board (vs `lastEventId`, which is
	// the last id we've accepted into the queue). Board digests are anchored to
	// this one so a checkpoint always names state that really exists.
	let appliedEventId = -1
	// A desync the engine detected on this client. Once set we stop trusting the
	// board: nothing this client does from here on will match the opponent.
	let desynced: { reason: string; action: string } | null = $state(null)
	let desyncUnsubscribe: (() => void) | null = null
	/**
	 * True while the queue is committing an event we pulled out of the LOG rather
	 * than one that arrived as live play (the catch-up replay after a load, or a
	 * gap backfill).
	 *
	 * An action that fails to apply in that window is not a divergence between the
	 * two players: the log is the room's shared truth, so every client replays the
	 * same hole and lands on the same board. Match 13 is why this distinction is
	 * here. One player's opening moves never reached the log, so the moves that
	 * followed them were unapplyable for everyone — and because the banner fired on
	 * replay too, it came straight back on every reload and never left, telling two
	 * players who were by then perfectly in sync that they were not. Those reports
	 * are still logged (they name exactly where the log broke); they just don't
	 * accuse the player of a desync they cannot do anything about.
	 */
	let applyingHistory = false
	// Once a board has diverged, EVERY later action can fail to apply. The first
	// few carry all the diagnostic value (they bracket the divergence); the rest
	// are consequences. Cap what we snapshot and ship so a broken match can't turn
	// into one board-sized POST per action.
	let desyncsLogged = 0
	const MAX_DESYNC_REPORTS = 5

	/**
	 * Record a board fingerprint at a known point in the event log. Two clients
	 * that report different digests for the same event id have provably diverged,
	 * and the last id they agreed on is where it happened — which is the whole
	 * reason `game_log` exists. Cheap (one pass over the two layers) and only run
	 * at turn boundaries, so it costs nothing per action.
	 */
	const checkpoint = (m: MapObject, eventId: number, label: string) => {
		try {
			logState(eventId, boardDigestDetail(m), label)
		} catch {
			// A digest is diagnostics; never let one break the turn it's measuring.
		}
	}

	// EVERY inbound event goes through this one serial queue, in event-id order,
	// and nothing is ever applied outside it — see `eventQueue.ts` for why that
	// rule is absolute (short version: the reconciliation poll used to bypass it
	// and apply an attack while the attacker was mid-slide and on no tile at all,
	// which silently split the two players' boards for the rest of the match).
	//
	// `caughtUp` still decides what's *eligible* to animate: a reconnect's backlog
	// fast-forwards instantly rather than replaying the match in slow motion.
	let caughtUp = false

	const queue = createEventQueue({
		ready: () => map() !== undefined,
		animate: async (action, entry) => {
			applyingHistory = !entry.live
			try {
				await animateRemoteAction(map()!, action)
			} finally {
				applyingHistory = false
			}
		},
		apply: (action, entry) => {
			applyingHistory = !entry.live
			try {
				dispatchSerializedAction(map()!, action)
			} finally {
				applyingHistory = false
			}
		},
		onApplied: (entry, animated) => {
			logIncoming(entry.id, entry.action, entry.via, animated ? 'animated' : 'applied')
			if (entry.provisional) {
				// On the board ahead of the log. If its committed event already came
				// through, this is the moment the watermark can take that id; otherwise
				// remember that one applied entry is waiting for its id.
				const id = committedIds.shift()
				if (id === undefined) {
					provisionalApplied += 1
				} else {
					appliedEventId = Math.max(appliedEventId, id)
					const m = map()
					if (m && entry.action.kind === 'end-turn') checkpoint(m, id, 'remote-end-turn')
				}
				requestRedraw = performance.now()
				return
			}
			appliedEventId = entry.id
			// An end-turn is the natural checkpoint: the board is quiet, both clients
			// have applied the same prefix of the log, and their digests should match.
			// A mismatch here names the exact event they diverged on.
			const m = map()
			if (m && entry.action.kind === 'end-turn') checkpoint(m, entry.id, 'remote-end-turn')
			requestRedraw = performance.now()
		},
		onDropped: (entry) => logIncoming(entry.id, entry.action, entry.via, 'no-map'),
	})

	/**
	 * The socket was open and still didn't hand us this event. Stop taking its word
	 * for it and go back to the fast poll until a push turns up in order again.
	 *
	 * Only an in-order, fresh push restores trust — deliberately. A socket whose
	 * frames consistently lose the race to a 1.5s poll arrives stale every time,
	 * and a transport that is always last is not one to throttle the poll for.
	 */
	const notePushMiss = () => {
		if (!realtimeUp || !pushTrusted) return
		pushTrusted = false
		logNote('realtime-unreliable', { lastEventId, appliedEventId })
	}

	const restorePushTrust = () => {
		if (pushTrusted) return
		pushTrusted = true
		logNote('realtime-reliable', { lastEventId, appliedEventId })
	}

	const applyEvent = (event: GameEvent, via: 'push' | 'poll'): boolean => {
		const m = map()
		if (!m) return false
		if (typeof event.id !== 'number') return false
		if (event.id <= lastEventId) {
			logIncoming(event.id, event.action, via, 'stale')
			return true
		}
		lastActivityAt = Date.now()
		waitingNoticed = []
		const action = normalizeAction(event.action)
		if (!action) {
			lastEventId = event.id
			return true
		}
		// `lastEventId` tracks what we've ACCEPTED (so the poll doesn't refetch it);
		// `appliedEventId` tracks what's actually on the board. They differ exactly
		// while the queue is draining, which is why the digest checkpoints below are
		// anchored to the applied one.
		lastEventId = event.id
		const fingerprint = actionFingerprint(action)
		if (claimSelf(fingerprint)) {
			// Our own action, already applied + animated locally when we made it.
			appliedEventId = event.id
			logIncoming(event.id, action, via, 'deduped')
			if (action.kind === 'end-turn') checkpoint(m, event.id, 'local-end-turn')
			requestRedraw = performance.now()
			return true
		}
		// Already on the board from the actor's live frame? Then this is the log
		// confirming it, in order: consume the provisional slot and let the
		// watermark move. A different action at this position means the board
		// followed a frame the log never confirmed, which is a real divergence.
		if (provisional.length > 0) {
			if (provisional[0] === fingerprint) {
				provisional.shift()
				if (provisionalApplied > 0) {
					provisionalApplied -= 1
					appliedEventId = Math.max(appliedEventId, event.id)
					if (action.kind === 'end-turn') checkpoint(m, event.id, 'remote-end-turn')
				} else {
					committedIds.push(event.id)
				}
				logIncoming(event.id, action, via, 'deduped')
				requestRedraw = performance.now()
				return true
			}
			provisional.length = 0
			provisionalApplied = 0
			committedIds.length = 0
			liveIncoming = null
			reportDesync(action, 'live-mismatch')
			return false
		}
		// A remote event we had to fetch is one the socket never handed us. Say so
		// before queueing it — the poll is the only place this is observable.
		if (via === 'poll' && caughtUp) notePushMiss()
		// Queue it — never apply here. Applying an event while an earlier one is
		// still animating is exactly what desynced matches; see `eventQueue.ts`.
		//
		// Eligible to animate on either transport. Gating this on `via === 'push'`
		// meant every event the reconciliation poll recovered teleported onto the
		// board, so one lost frame turned the rest of an opponent's turn into a
		// silent jump. Live play is live play however it reached us; the queue
		// decides at drain time whether there's room to play it out.
		queue.push({ id: event.id, action, animate: caughtUp, live: caughtUp, via })
		logIncoming(event.id, action, via, 'queued')
		requestRedraw = performance.now()
		return true
	}

	// Pushes that overtook their predecessor wait here rather than being thrown
	// away and re-fetched — see `pushBuffer.ts`.
	const pushBuffer = createPushBuffer({
		lastId: () => lastEventId,
		accept: (event) => void applyEvent(event, 'push'),
		max: MAX_HELD_PUSHES,
	})

	let pollInFlight = false
	let pollAgain = false
	/**
	 * Ask the next poll where our own request stream resumes.
	 *
	 * Answering that costs the server a count on the event table, and a client
	 * needs it twice in a match: once on the first poll after a load, and again if
	 * the server ever refuses an ordinal. Asking every 1.5 seconds for the rest of
	 * the match spent a fifth of the poll's gateway budget restating a number we
	 * already had — on the hottest path in the app, per client, per room.
	 */
	let wantServerSeq = true
	/**
	 * The id of the last event in the ROOM, as of our last poll. `appliedEventId`
	 * is where our board is; the difference between them is how far behind the log
	 * this client is, which is the one number that describes what a lagging
	 * spectator actually experiences.
	 */
	let serverLastEventId = -1

	/**
	 * Reconciliation pass. Coalesced: a gap can fire one of these from the push
	 * handler while the interval's own pass is still open, and stampeding the
	 * endpoint to race ourselves to the same rows helps nobody. Anyone who asks
	 * during a pass gets one more immediately after it, so no request is dropped.
	 */
	const poll = async (): Promise<void> => {
		if (!multiplayer) return
		if (pollInFlight) {
			pollAgain = true
			return
		}
		pollInFlight = true
		try {
			await pollOnce()
		} finally {
			pollInFlight = false
		}
		if (pollAgain) {
			pollAgain = false
			await poll()
		}
	}

	const pollOnce = async () => {
		try {
			const seqQuery = wantServerSeq ? '&seq=1' : ''
			// A reconciliation pass on a trusted socket asks the cheap question first:
			// has the log moved past what I hold? The server answers from a cache
			// cursor and touches the database only when it has. Async rooms never
			// ask: there the poll is the transport, not a check.
			const cursorQuery =
				realtimeUp && pushTrusted && !asyncGame && !wantServerSeq && pushBuffer.size === 0
					? '&cursor=1'
					: ''
			const res = await fetch(
				`/api/game/${gameSession}/events?since=${lastEventId}${seqQuery}${cursorQuery}`
			)
			if (!res.ok) return
			const data = (await res.json()) as {
				events?: GameEvent[]
				lastEventId?: number
				turnDeadline?: number | null
				aiTeams?: number[]
				isAiDriver?: boolean
				clientSeq?: number
				pollAfterMs?: number
			}
			if (!data?.events) return
			if (typeof data.pollAfterMs === 'number' && data.pollAfterMs >= POLL_INTERVAL) {
				connectedPollTicks = Math.max(1, Math.round(data.pollAfterMs / POLL_INTERVAL))
			}
			if (typeof data.lastEventId === 'number') {
				serverLastEventId = Math.max(serverLastEventId, data.lastEventId)
			}
			// Where our own request stream resumes. Only ever adopted when we have
			// nothing in flight (the relay chain is idle), so a poll landing between a
			// relay's send and its response can't rewind the counter under it.
			if (typeof data.clientSeq === 'number') {
				if (data.clientSeq > clientSeq && relaysOwed() === 0) clientSeq = data.clientSeq
				// Answered, so stop asking until something invalidates it again.
				wantServerSeq = false
			}
			if (asyncGame && data.turnDeadline !== undefined) deadline = data.turnDeadline
			if (Array.isArray(data.aiTeams)) {
				// Replace only on a real change so the state manager's CPU effect isn't
				// re-keyed (and its in-flight turn cancelled) by every poll.
				const next = data.aiTeams
				if (next.length !== liveAiTeams.length || next.some((t, i) => t !== liveAiTeams[i])) {
					liveAiTeams = next
				}
			}
			if (typeof data.isAiDriver === 'boolean' && data.isAiDriver !== liveIsAiDriver) {
				liveIsAiDriver = data.isAiDriver
			}
			for (const evt of data.events) {
				if (!applyEvent(evt, 'poll')) break
			}
			// The fetch may have closed the hole a held push was waiting behind.
			pushBuffer.drain()
		} catch {
			// network errors are expected occasionally; keep polling.
		}
	}

	const pollTimerTick = () => {
		pollTick += 1
		// Throttle only while the socket has earned it. A hole we're holding pushes
		// behind, or a socket already caught missing one, keeps the fast interval —
		// the throttle is a reward for a transport that is demonstrably working, not
		// the default. At 20 ticks it is a 30-second blind spot, which is long enough
		// for a whole turn to go unseen and then land in one lump.
		const throttled = realtimeUp && pushTrusted && pushBuffer.size === 0
		if (throttled && pollTick % connectedPollTicks !== 0) return
		void poll()
	}

	// Pushed over the websocket the moment the server records a move. Events
	// carry the log sequence id, so ordering is checkable: apply the next id
	// directly, and on a gap (a lost push) backfill from the event log instead
	// of applying out of order.
	/**
	 * A frame the acting client published itself, ahead of the log. Applied
	 * provisionally when it is the next index of the turn we are watching. A frame
	 * that skips ahead means one was lost: from there the rest of that turn is
	 * taken from the log when it commits, as a block, rather than risk a board
	 * that applied step three without step two.
	 */
	const onLiveFrame = (live: {
		sender?: unknown
		turn?: unknown
		index?: unknown
		action?: unknown
	}) => {
		if (typeof live.sender !== 'string' || typeof live.index !== 'number') return
		if (live.sender === userSession) return
		// History still loading: the committed log will carry these.
		if (!caughtUp) return
		const action = normalizeAction(live.action)
		if (!action) return
		const key = `${live.sender}:${String(live.turn)}`
		if (!liveIncoming || liveIncoming.key !== key) liveIncoming = { key, nextIndex: 0, gap: false }
		if (liveIncoming.gap || live.index < liveIncoming.nextIndex) {
			logIncoming(-1, action, 'live', liveIncoming.gap ? 'gap' : 'stale')
			return
		}
		if (live.index > liveIncoming.nextIndex) {
			liveIncoming.gap = true
			logIncoming(-1, action, 'live', 'gap')
			return
		}
		liveIncoming.nextIndex += 1
		lastActivityAt = Date.now()
		waitingNoticed = []
		provisional.push(actionFingerprint(action))
		queue.push({ id: -1, action, animate: true, live: true, via: 'live', provisional: true })
		logIncoming(-1, action, 'live', 'queued')
		requestRedraw = performance.now()
	}

	const onRealtimeEvent = (message: RealtimeMessage) => {
		const live = (message.payload as { live?: unknown } | null)?.live
		if (live && typeof live === 'object') {
			onLiveFrame(live as Parameters<typeof onLiveFrame>[0])
			return
		}
		const payload = message.payload as { event?: GameEvent; events?: GameEvent[] } | null
		// A frame carries a whole relayed run since batching. `event` is repeated as
		// the first of it for older bundles; reading `events` when present is what
		// makes a batched turn arrive as one contiguous, gapless run — which is the
		// reason the throttled poll survives a burst instead of dropping back to
		// 1.5s and spending the budget the writes need.
		const batch =
			Array.isArray(payload?.events) && payload.events.length
				? payload.events
				: payload?.event
					? [payload.event]
					: []
		if (batch.length === 0) return
		let accepted = 0
		let gap = false
		for (const event of batch) {
			if (!event || typeof event.id !== 'number') continue
			const outcome = pushBuffer.offer(event)
			if (outcome === 'stale') {
				logIncoming(event.id, event.action, 'push', 'stale')
				continue
			}
			if (outcome === 'accepted') {
				accepted += 1
				continue
			}
			// Held (or dropped): there is a hole in front of it that only the log can
			// fill. Everything waiting is applied behind whatever that recovers.
			gap = true
		}
		if (batch.length) {
			const head = batch[batch.length - 1]
			if (typeof head?.id === 'number') serverLastEventId = Math.max(serverLastEventId, head.id)
		}
		if (gap) {
			void poll()
			return
		}
		// The socket handed us the next ids in order. That is the only thing that
		// earns back the throttled poll.
		if (accepted > 0) restorePushTrust()
	}

	const connectRealtime = async () => {
		const conn = new RealtimeConnection({
			channels: [`game:${gameSession}`],
			onStatus: (connected) => {
				realtimeUp = connected
				// A fresh socket starts trusted; it has not missed anything yet, and the
				// catch-up poll below covers whatever it slept through.
				if (connected) pushTrusted = true
				logNote(connected ? 'realtime-up' : 'realtime-down', { lastEventId, appliedEventId })
				// Anything pushed while we were down is only in the event log.
				if (connected) void poll()
			},
		})
		conn.subscribe(`game:${gameSession}`, onRealtimeEvent)
		try {
			await conn.open()
			realtimeConn = conn
		} catch {
			// No realtime (e.g. local mock gateway) — 1500ms polling carries the
			// game exactly as before.
			logNote('realtime-unavailable')
			conn.close()
		}
	}

	const flashWrongTurn = () => {
		wrongTurn = true
		if (wrongTurnTimer) clearTimeout(wrongTurnTimer)
		wrongTurnTimer = setTimeout(() => {
			wrongTurn = false
		}, 1500)
	}

	/**
	 * This client's own 0-based counter for the room. `game_event.seq` records
	 * which request won its insert race, NOT the order the player acted in, so
	 * this is what carries the real order to the server (see `appendEvent`). Only
	 * bumped once an action is durably recorded — a rejected or failed relay must
	 * not consume an ordinal, or every later action is refused as out of order.
	 *
	 * Seeded from the poll rather than assumed to be 0: a reload mid-match resumes
	 * a stream the server already has rows for.
	 */
	let clientSeq = 0
	/** Transient failures worth riding out before giving up on an action. */
	const RELAY_ATTEMPTS = 3
	const RELAY_BACKOFF_MS = [250, 750]
	/**
	 * A rate limit gets its own, longer budget. Every other retryable failure is
	 * a guess about whether waiting helps; this one is the server telling us the
	 * exact second it will accept the move. Spending three quick attempts against
	 * a 56-second cooldown would burn the budget in a second and then declare a
	 * move lost that was never lost — and losing a move freezes the board, which
	 * is a far worse outcome than a pause the player can see counting down.
	 */
	const RELAY_BUSY_ATTEMPTS = 6
	/** Cap on one honoured back-off, so a bad number can't hang a turn. */
	const MAX_BUSY_WAIT_MS = 20_000
	/** Only one "server is busy" toast per relay, however many attempts it takes. */
	let busyNotified = false

	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

	/**
	 * An action we applied locally that the room will never see.
	 *
	 * This is the other half of a desync, and until match 13 it was the silent
	 * half. The engine's reports catch the case where the LOG holds something this
	 * board cannot apply; this catches the reverse — this board holds something the
	 * log refused. It is strictly worse for the player who suffers it, because
	 * nothing on their screen looks wrong: their units are where they moved them,
	 * and the opponent simply walks through the ones the room never saw move.
	 *
	 * Routed through `reportDesync` so it lands on exactly the same path as an
	 * engine bail-out — logged, surfaced, and the board frozen — rather than being
	 * a second, parallel notion of "out of sync".
	 */
	const reportUnrelayed = (action: SerializedAction, reason: 'action-refused' | 'action-lost') => {
		if (!multiplayer) return
		// Stop relaying whatever is still queued. `reportDesync` freezes the board,
		// and everything behind this action came off the same board — the one we now
		// know the room does not share. Sending it would keep writing the room's
		// history from a client that has already been told it is wrong, and each of
		// those relays would be refused in turn for the same reason. The same
		// reasoning gates the CPU's own commits (see `cpuAi.commit`).
		outbox.length = 0
		reportDesync(action, reason)
	}

	/**
	 * Relay a run of this client's own consecutive actions, retrying as needed
	 * until every one of them is in the log or the run is given up on.
	 *
	 * The remainder shrinks as the server settles it, and progress resets the
	 * failure budget: a batch that got half way and then hit a cooldown has
	 * demonstrated the transport works, so the rest of it deserves a full budget
	 * rather than inheriting the failure count of a delay it already survived.
	 */
	const relay = async (batch: SerializedAction[]) => {
		busyNotified = false
		let pending = batch
		let budget = RELAY_ATTEMPTS
		for (let attempt = 0; attempt < budget; attempt++) {
			const outcome = await relayOnce(pending, attempt)
			if (outcome.settled > 0) {
				pending = pending.slice(outcome.settled)
				if (pending.length === 0) return
				attempt = -1
				budget = RELAY_ATTEMPTS
				if (outcome.waitMs === undefined) continue
			}
			// `stop` means the server gave an answer that retrying cannot improve;
			// relayOnce has already logged it and reported the divergence.
			if (outcome.stop) return
			if (outcome.waitMs !== undefined) {
				// The server named a wait. Honour it instead of our own back-off
				// curve, and extend the budget so the move survives the cooldown.
				budget = Math.max(budget, RELAY_BUSY_ATTEMPTS)
				await wait(Math.min(outcome.waitMs, MAX_BUSY_WAIT_MS))
				continue
			}
			await wait(RELAY_BACKOFF_MS[Math.min(Math.max(attempt, 0), RELAY_BACKOFF_MS.length - 1)])
		}
		// Out of attempts. These actions are already on our board but not in the
		// log, so this client is ahead of the room. We deliberately do NOT consume
		// their ordinals — blocking the stream forever over a lost action would be
		// worse than the gap. The board is frozen from here: playing on against
		// state the room never accepted is what turns one lost action into an
		// unplayable match.
		logOutgoing(pending[0], 'failed', { error: 'exhausted-retries', unsent: pending.length })
		reportUnrelayed(pending[0], 'action-lost')
	}

	/**
	 * One relay attempt for a run of actions.
	 *
	 * `settled` is how many of them the server durably recorded — which can be
	 * fewer than were sent, when a batch was cut short by a cooldown part way
	 * through. Those are settled for good: their ordinals are consumed and only
	 * the remainder is re-sent. `waitMs` is the server naming its own back-off;
	 * `stop` means no retry can help.
	 */
	type RelayOutcome = { settled: number; stop?: boolean; waitMs?: number }

	const relayOnce = async (batch: SerializedAction[], attempt: number): Promise<RelayOutcome> => {
		const started = performance.now()
		// A lone action is sent in the original single-action shape. Not just for
		// tidiness: it keeps the overwhelmingly common request byte-identical to
		// what every deployed server already accepts, so batching cannot break the
		// one case that was never slow.
		const body = batch.length === 1 ? { event: batch[0], clientSeq } : { events: batch, clientSeq }
		try {
			const res = await fetch(`/api/game/${gameSession}/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (res.status === 409) {
				// Our counter is out of step with the sender stream the server has —
				// typically a reload that restarted at 0. The response says where to
				// resume; adopt it and try again rather than letting the action drop.
				const data = (await res.json().catch(() => null)) as { expected?: number } | null
				if (typeof data?.expected === 'number' && data.expected !== clientSeq) {
					logOutgoing(batch[0], 'failed', {
						status: 409,
						was: clientSeq,
						expected: data.expected,
					})
					clientSeq = data.expected
					// The server's view of our stream moved under us, so re-seed from it
					// on the next poll rather than trusting the local counter again.
					wantServerSeq = true
					return { settled: 0 }
				}
				// The counter already matches what the server expects and it still
				// refused, so retrying can only produce the same answer. The actions
				// are on our board and nowhere else.
				logOutgoing(batch[0], 'failed', { status: 409, attempt })
				reportUnrelayed(batch[0], 'action-lost')
				return { settled: 0, stop: true }
			}
			if (res.status === 403) {
				// Rejected: the server disagrees about whose turn it is, so our board
				// has already applied something the room never accepted. Worth logging
				// loudly — it's a divergence, just one we caught at the source.
				// Nothing was recorded, so the ordinals stay unconsumed.
				logOutgoing(batch[0], 'rejected', { status: 403 })
				flashWrongTurn()
				// The flash alone was not enough. It reads as "that click didn't take",
				// but the click DID take locally — this board and the room have disagreed
				// about the turn since whenever the first one was refused, and every
				// action after it compounds the split. Freeze and offer the resync.
				reportUnrelayed(batch[0], 'action-refused')
				return { settled: 0, stop: true }
			}
			if (res.status === 429) {
				// The backend is rate limited, not refusing these moves. Nothing was
				// recorded, so the ordinals stay unconsumed and re-sending the same
				// ones is safe (the server dedupes on sender + clientSeq).
				const data = (await res.json().catch(() => null)) as { retryAfter?: number } | null
				const seconds =
					typeof data?.retryAfter === 'number' && data.retryAfter > 0 ? data.retryAfter : 2
				noteServiceBusy(seconds)
				logOutgoing(batch[0], 'failed', {
					status: 429,
					attempt,
					retryAfter: seconds,
					actions: batch.length,
				})
				notifyBusy()
				return { settled: 0, waitMs: seconds * 1000 }
			}
			if (!res.ok) {
				// 5xx is worth another go; a 4xx we don't recognise is not.
				if (res.status >= 500) {
					logOutgoing(batch[0], 'failed', { status: res.status, attempt })
					return { settled: 0 }
				}
				logOutgoing(batch[0], 'failed', { status: res.status })
				reportUnrelayed(batch[0], 'action-lost')
				return { settled: 0, stop: true }
			}
			const result = (await res.json()) as {
				event?: GameEvent
				events?: GameEvent[]
				appended?: number
				partial?: boolean
				rateLimited?: boolean
				retryAfter?: number
				turnDeadline?: number | null
			}
			const recorded = Array.isArray(result?.events)
				? result.events
				: result?.event
					? [result.event]
					: []
			// How many ordinals this answer consumed. `appended` is authoritative;
			// a server that predates batching answers with one event and no count,
			// and we only ever send it one action at a time.
			const settled =
				typeof result?.appended === 'number'
					? Math.min(result.appended, batch.length)
					: Math.min(Math.max(recorded.length, 1), batch.length)
			if (settled <= 0) {
				// A well-formed answer that recorded nothing. Treat it as a transient
				// failure rather than a lost move: the ordinals are unconsumed, so a
				// re-send is safe and the alternative is freezing a live board over an
				// answer we do not understand.
				logOutgoing(batch[0], 'failed', { status: res.status, appended: 0, attempt })
				return { settled: 0 }
			}
			// Durably recorded — only now do these actions own their ordinals.
			const base = clientSeq
			clientSeq += settled
			for (const event of recorded) {
				if (typeof event?.id !== 'number') continue
				lastEventId = Math.max(lastEventId, event.id)
				appliedEventId = Math.max(appliedEventId, event.id)
			}
			// One trace entry per action, as before: the desync forensics read this
			// as a per-action stream and collapsing a batch into one row would hide
			// exactly the ordering it exists to reconstruct.
			batch.slice(0, settled).forEach((action, index) => {
				logOutgoing(action, 'sent', {
					eventId: recorded[index]?.id ?? recorded[recorded.length - 1]?.id,
					clientSeq: base + index,
					...(batch.length > 1 ? { batch: batch.length, batchIndex: index } : {}),
				})
			})
			notePerf(res, started, batch.length, settled)
			// An end-turn hands the fresh allowance to the opponent — reflect it
			// right away instead of waiting for the next poll.
			if (asyncGame && result?.turnDeadline !== undefined) deadline = result.turnDeadline
			if (result?.partial && settled < batch.length) {
				// The server recorded a prefix and stopped. Keep the settled part and
				// re-send the rest, honouring its back-off when it named one.
				if (result.rateLimited) {
					const seconds = result.retryAfter && result.retryAfter > 0 ? result.retryAfter : 2
					noteServiceBusy(seconds)
					notifyBusy()
					return { settled, waitMs: seconds * 1000 }
				}
				return { settled }
			}
			return { settled, stop: settled >= batch.length }
		} catch {
			// The request never completed, so we can't know whether it landed. The
			// server dedupes on (sender, clientSeq), so re-sending the same ordinals
			// is safe: a retry of a request that actually succeeded returns the
			// stored events instead of appending a second copy.
			logOutgoing(batch[0], 'failed', { error: 'network', attempt, actions: batch.length })
			return { settled: 0 }
		}
	}

	/** One toast per relay, however many attempts or batches it takes. */
	const notifyBusy = () => {
		if (busyNotified) return
		// One toast, because the banner is already carrying the countdown — this
		// only has to explain why the board went quiet for a moment.
		busyNotified = true
		addToast('Servers are busy. Holding your move and retrying.', 'warn')
	}

	/**
	 * Record what a relay cost, next to how far behind the room it left us.
	 *
	 * `x-gateway-calls` is the server telling us how many gateway calls it made
	 * to answer — the number that actually governs throughput here, because the
	 * platform budgets those per minute across the whole project. A relay that
	 * took a second because it made eight calls and one that took a second
	 * because the gateway was slow need completely different fixes, and this is
	 * the only place both are visible at once.
	 */
	const notePerf = (res: Response, startedAt: number, actions: number, settled: number): void => {
		const calls = Number(res.headers.get('x-gateway-calls'))
		const gatewayMs = Number(res.headers.get('x-gateway-ms'))
		logPerf(appliedEventId, {
			what: 'relay',
			actions,
			settled,
			relayMs: Math.round(performance.now() - startedAt),
			...(Number.isFinite(calls) && calls > 0 ? { calls } : {}),
			...(Number.isFinite(gatewayMs) && gatewayMs > 0 ? { gatewayMs } : {}),
			owed: relaysOwed(),
			logLag: Math.max(0, serverLastEventId - appliedEventId),
		})
	}

	/**
	 * Actions waiting to go out, and the run currently in flight.
	 *
	 * Relays are still one-in-flight-at-a-time — the server stamps each event's
	 * `seq` when the request ARRIVES, so two overlapping POSTs can be recorded in
	 * the opposite order to the one the player performed them in, and the log is
	 * what every other client (and the replay) plays back. An attack recorded
	 * before the move that set it up is unapplyable on arrival.
	 *
	 * What changed is what one request carries. Sending a single action per
	 * request made the room's throughput equal to one server round trip per
	 * action, which a client driving a CPU side blows straight past: it produces
	 * a turn's worth of actions in a moment and then spends a minute dripping
	 * them out while its own board runs ahead. Batching the queue into one
	 * request keeps the ordering guarantee — a run is numbered from our own
	 * counter before anything is sent, so it cannot interleave with itself — and
	 * costs the room one set of server-side reads instead of one per action.
	 *
	 * A lone action still goes out on its own immediately. Batches only form when
	 * actions arrive faster than the round trip, which is exactly when the old
	 * behaviour was falling behind.
	 */
	const outbox: SerializedAction[] = []
	let inFlight: SerializedAction[] = []
	let relayBusy = false

	/** Actions this client has applied locally that the room has not accepted. */
	const relaysOwed = (): number => outbox.length + inFlight.length

	/**
	 * Take the next run off the outbox.
	 *
	 * A batch is credited to one actor and the server resolves that once, before
	 * writing any of it, so a run must not span a turn handover: it ends at the
	 * `end-turn` that closes it. A `surrender` travels alone, because the server
	 * rewrites it to the sender's own team and settles the room around it.
	 */
	const takeBatch = (): SerializedAction[] => {
		if (outbox[0].kind === 'surrender') return outbox.splice(0, 1)
		let size = 0
		while (size < outbox.length && size < MAX_RELAY_BATCH) {
			const action = outbox[size]
			if (action.kind === 'surrender') break
			size += 1
			if (action.kind === 'end-turn') break
		}
		return outbox.splice(0, size)
	}

	/**
	 * Whether what is queued is ready to go. In a live room the run is the turn:
	 * it leaves at the handover (or at the size cap), as one request the server
	 * stores as one row. That is where the per-action server call went. Async
	 * rooms still relay each action at once; the opponent is offline and a
	 * closed tab must not lose a move there.
	 */
	const runReady = (): boolean => {
		if (asyncGame) return true
		if (outbox.length >= MAX_RELAY_BATCH) return true
		return outbox.some((action) => action.kind === 'end-turn' || action.kind === 'surrender')
	}

	/** Live frames leave a few at a time, under the service's per-socket rate. */
	const drainLive = () => {
		liveDrainTimer = null
		const frame = liveOutbox.shift()
		if (frame === undefined) return
		realtimeConn?.publish(`game:${gameSession}`, frame)
		if (liveOutbox.length) liveDrainTimer = setTimeout(drainLive, LIVE_FRAME_GAP_MS)
	}

	const publishLive = (action: SerializedAction) => {
		if (asyncGame || !realtimeUp || !userSession) return
		liveOutbox.push({ live: { sender: userSession, turn: liveTurn, index: liveIndex, action } })
		liveIndex += 1
		if (action.kind === 'end-turn' || action.kind === 'surrender') {
			liveTurn += 1
			liveIndex = 0
		}
		if (!liveDrainTimer) drainLive()
	}

	const pumpRelay = () => {
		if (relayBusy || outbox.length === 0 || !runReady()) return
		relayBusy = true
		const batch = takeBatch()
		inFlight = batch
		// One dedupe slot per action, released when the run settles. By then either
		// the echo has already claimed it, or `lastEventId` has moved past our own
		// events and the echoes behind them are skipped as stale — so holding a slot
		// any longer can only swallow somebody else's identical action later.
		const slots = batch.map((action) => {
			const slot: SelfRelay = { fingerprint: actionFingerprint(action) }
			pendingSelf.push(slot)
			return slot
		})
		void relay(batch)
			.catch(() => {})
			.finally(() => {
				for (const slot of slots) releaseSelf(slot)
				inFlight = []
				relayBusy = false
				pumpRelay()
			})
	}

	const enqueueRelay = (action: SerializedAction) => {
		publishLive(action)
		outbox.push(action)
		pumpRelay()
	}

	/**
	 * Record how far behind this client is, on a slow tick, while it is behind.
	 *
	 * The two numbers are the two ways a room falls behind, and they belong to
	 * different players. `owed` is a SENDER's backlog: actions on our board that
	 * the room has not accepted, which is what a client driving a CPU side
	 * accumulates when it can produce turns faster than it can relay them.
	 * `logLag` is a RECEIVER's: events in the log we have not applied. The host
	 * showing turn 29 while the spectator shows turn 14 is `owed` on one client
	 * and `logLag` on the other, and neither client could see the whole picture
	 * before this — which is why the gap was only ever noticed by watching two
	 * screens side by side.
	 *
	 * Silent while both are clear, so a healthy match writes nothing at all.
	 */
	const gaugeTick = () => {
		const owed = relaysOwed()
		const logLag = Math.max(0, serverLastEventId - appliedEventId)
		if (owed === 0 && logLag === 0 && queue.size === 0) return
		logPerf(appliedEventId, {
			what: 'gauge',
			owed,
			logLag,
			queued: queue.size,
			// How long the front of that queue has been waiting. A deep queue is
			// normal — relays arrive in bursts, and a burst that drains before the
			// next one lands is a spectator WATCHING a turn, which is the point of the
			// thing. This is the number that separates that from actually running
			// late, and it is what the queue itself paces on (see `eventQueue`).
			queueLagMs: queue.lagMs,
			// Whether that lag is deliberate. `catchingUp` is the queue having given
			// up on watching because this client fell behind the room. Without the
			// distinction every animated turn would read as lag and the numbers would
			// mean nothing.
			catchingUp: queue.catchingUp,
			pushTrusted,
			realtimeUp,
			held: pushBuffer.size,
		})
	}

	const send = (data: string) => {
		let parsed: unknown
		try {
			parsed = JSON.parse(data)
		} catch {
			return
		}
		const action: SerializedAction | null = normalizeAction(parsed)
		if (!action) return
		enqueueRelay(action)
	}

	const socket = { send } as unknown as WebSocket

	const onOutgoing = (action: SerializedAction | null) => {
		if (!action) return
		if (!multiplayer) return
		enqueueRelay(action)
	}

	/**
	 * Ask who is still here. Fired only by `stallTick`, so it costs nothing while
	 * the match is moving. The answer names who the room is waiting on; the first
	 * time we hear about someone, say so, so the pause reads as a countdown.
	 */
	const presenceCheck = async () => {
		try {
			const res = await fetch(`/api/game/${gameSession}/heartbeat`, { method: 'POST' })
			if (!res.ok) return
			const data = (await res.json()) as {
				waiting?: { team: number | null; sinceMs: number; graceMs: number }[]
			} | null
			for (const w of data?.waiting ?? []) {
				if (w.team == null || waitingNoticed.includes(w.team)) continue
				waitingNoticed.push(w.team)
				const left = Math.max(1, Math.ceil((w.graceMs - w.sinceMs) / 1000))
				addToast(
					`A player lost connection. Their side forfeits in ${left}s unless they return.`,
					'warn'
				)
			}
		} catch {
			// best-effort
		}
	}

	const stallTick = () => {
		if (!realtimeUp) return
		if (Date.now() - lastActivityAt < STALL_CHECK_MS) return
		// Re-arm so a stall asks once per interval, not once per tick.
		lastActivityAt = Date.now()
		void presenceCheck()
	}

	onMount(() => {
		if (!browser) return
		multiplayer = isMultiplayer()
		if (!multiplayer) return
		resetDesync()
		startLiveLog(gameSession)
		logNote('joined', { asyncGame })
		// The engine reports any action it could not apply (see `desync.ts`). In a
		// local game nobody listens; online it means this client's board no longer
		// matches the room's, so capture it with the board that produced it and tell
		// the player, rather than letting the divergence compound in silence.
		desyncUnsubscribe = desyncReports.subscribe((report) => {
			if (!report) return
			// Replaying the log: a hole here is shared by every client, so it is
			// diagnostics, not a divergence. Recorded, never surfaced — see
			// `applyingHistory`.
			const history = applyingHistory
			if (!history) {
				desynced = { reason: report.reason, action: report.action.kind }
				// Freeze input. The board is provably not the room's board, and every
				// further action either gets refused or is recorded against state the
				// room never reached.
				lockGameplayForDesync()
			}
			if (desyncsLogged >= MAX_DESYNC_REPORTS) return
			desyncsLogged += 1
			const m = map()
			logDesync(
				appliedEventId,
				report.action,
				history ? `${report.reason}/replay` : report.reason,
				m ? boardSnapshot(m).slice(0, 4000) : undefined
			)
		})
		outgoingUnsubscribe = outgoingActions.subscribe(onOutgoing)
		void poll().then(() => {
			// The backlog is on the board; from here on, live pushes animate.
			caughtUp = true
			pollTimer = setInterval(pollTimerTick, POLL_INTERVAL)
		})
		void connectRealtime()
		// Presence is checked only once the room has gone quiet; see STALL_CHECK_MS.
		stallTimer = setInterval(stallTick, STALL_CHECK_MS / 3)
		if (asyncGame) clockTimer = setInterval(() => (clockNow = Date.now()), 1000)
		gaugeTimer = setInterval(gaugeTick, GAUGE_INTERVAL)
		// A last flush as the tab goes away, so the trace of a match someone walked
		// out of still reaches the server. `pagehide` fires where `unload` doesn't
		// (bfcache, mobile Safari), which is exactly the case we'd otherwise lose.
		window.addEventListener('pagehide', onPageHide)
	})

	const onPageHide = () => {
		logNote('pagehide', { lastEventId, appliedEventId, pending: queue.size })
		stopLiveLog()
	}

	onDestroy(() => {
		if (browser) window.removeEventListener('pagehide', onPageHide)
		if (multiplayer) {
			logNote('left', { lastEventId, appliedEventId })
			stopLiveLog()
		}
		if (desyncUnsubscribe) desyncUnsubscribe()
		if (pollTimer) clearInterval(pollTimer)
		if (stallTimer) clearInterval(stallTimer)
		if (liveDrainTimer) clearTimeout(liveDrainTimer)
		if (wrongTurnTimer) clearTimeout(wrongTurnTimer)
		if (clockTimer) clearInterval(clockTimer)
		if (gaugeTimer) clearInterval(gaugeTimer)
		if (outgoingUnsubscribe) outgoingUnsubscribe()
		realtimeConn?.close()
	})

	/**
	 * The only honest recovery from a detected desync. There is no server-side
	 * simulation to ask for the truth, but the event log IS the truth: a reload
	 * re-runs `poll(since=-1)` from a fresh board and replays every action in
	 * order, which rebuilds exactly the state the room agrees on.
	 *
	 * Now that a desync freezes input there is nothing left to finish first, so
	 * this is the one way out of the frozen state — which is also why it has to
	 * actually clear it. It does: the reload starts from the log, and a hole in the
	 * log no longer re-raises the banner (see `applyingHistory`), so a client that
	 * has resynced comes back unlocked and matching the room.
	 */
	const resync = () => {
		logNote('resync-requested', { lastEventId, appliedEventId })
		stopLiveLog()
		location.reload()
	}

	/**
	 * A deploy has landed since this tab loaded its bundle.
	 *
	 * Harmless on most pages; not in a live match. This client speaks whatever sync
	 * protocol it shipped with, and the room's other seat may now be speaking a
	 * newer one. That is not hypothetical — it is exactly how match 13 broke, with
	 * one player on a pre-deploy bundle relaying unordered actions into a log the
	 * other player then could not replay. Reloading rebuilds the board from the log
	 * and costs nothing, so say so plainly rather than waiting for the desync.
	 */
	const staleBuild = $derived(multiplayer && updated.current && !desynced)

	const reloadForUpdate = () => {
		logNote('stale-build-reload', { lastEventId, appliedEventId })
		stopLiveLog()
		location.reload()
	}

	const children_render = $derived(children)
</script>

{#if multiplayer}
	{@render children?.({
		socket,
		requestRedraw,
		aiTeams: liveAiTeams,
		isAiDriver: liveIsAiDriver,
	})}
	{#if asyncGame && deadlineLeftMs != null}
		<div
			class="fixed top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-full shadow z-40 pointer-events-none {deadlineLeftMs <
			3 * 60 * 60 * 1000
				? 'bg-red-600 text-white'
				: 'bg-black/70 text-white'}"
			data-testid="turn-clock"
			title="Time left to finish the current turn"
		>
			<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
				<path
					d="M6 2h12v2l-4.5 4.5a2 2 0 0 0 0 3L18 16v2h.5a1 1 0 1 1 0 2h-13a1 1 0 1 1 0-2H6v-2l4.5-4.5a2 2 0 0 0 0-3L6 4V2z"
				/>
			</svg>
			{formatTimeLeft(deadlineLeftMs)}
		</div>
	{/if}
	{#if desynced}
		<div
			class="fixed bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-amber-600 text-white text-sm px-4 py-2 rounded shadow-lg z-50"
			in:fly={{ y: 10 }}
			data-testid="desync-toast"
		>
			<span>
				Out of sync with your opponent.
				{#if $syncLocked}Your moves are paused until you resync.{/if}
			</span>
			<button class="underline font-semibold" onclick={resync} data-testid="desync-resync"
				>Resync now</button
			>
		</div>
	{/if}
	{#if staleBuild}
		<div
			class="fixed bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-sky-700 text-white text-sm px-4 py-2 rounded shadow-lg z-50"
			in:fly={{ y: 10 }}
			data-testid="stale-build-toast"
		>
			<span>A new version of the game is out.</span>
			<button
				class="underline font-semibold"
				onclick={reloadForUpdate}
				data-testid="stale-build-reload">Reload</button
			>
		</div>
	{/if}
	{#if wrongTurn}
		<div
			class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm font-mono px-4 py-2 rounded shadow-lg z-50 pointer-events-none"
			in:fly={{ y: 10 }}
			out:fly={{ y: 10 }}
			data-testid="wrong-turn-toast"
		>
			Not your turn
		</div>
	{/if}
{:else}
	<LocalInteracter {map}>
		{#snippet children({ socket, requestRedraw })}
			{@render children_render?.({ socket, requestRedraw })}
		{/snippet}
	</LocalInteracter>
{/if}
