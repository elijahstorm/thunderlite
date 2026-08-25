<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte'
	import { browser } from '$app/environment'
	import { updated } from '$app/state'
	import LocalInteracter from '$lib/Engine/Interactor/LocalInteracter.svelte'
	import {
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
	const CONNECTED_POLL_EVERY_TICKS = 20
	// A push that overtakes its predecessor is held here until the hole in front of
	// it fills, rather than being thrown away and re-fetched. Bounded so a socket
	// that starts spraying ids from the far future can't grow this without limit.
	const MAX_HELD_PUSHES = 64
	// Presence ping — keeps our `last_seen` fresh so the server doesn't auto-resign
	// us, and drives the sweep that resigns an opponent who left. Independent of the
	// event poll, whose cadence varies with how well the socket is delivering.
	const HEARTBEAT_INTERVAL = 10_000

	const isMultiplayer = (): boolean => {
		if (!gameSession) return false
		if (gameSession === 'ephemeral') return false
		if (gameSession === 'testSession') return false
		return true
	}

	let multiplayer = $state(false)
	let lastEventId = -1
	let pollTimer: ReturnType<typeof setInterval> | null = null
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null
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
		const fingerprint = JSON.stringify(action)
		if (claimSelf(fingerprint)) {
			// Our own action, already applied + animated locally when we made it.
			appliedEventId = event.id
			logIncoming(event.id, action, via, 'deduped')
			if (action.kind === 'end-turn') checkpoint(m, event.id, 'local-end-turn')
			requestRedraw = performance.now()
			return true
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
			const res = await fetch(`/api/game/${gameSession}/events?since=${lastEventId}`)
			if (!res.ok) return
			const data = (await res.json()) as {
				events?: GameEvent[]
				turnDeadline?: number | null
				aiTeams?: number[]
				isAiDriver?: boolean
				clientSeq?: number
			}
			if (!data?.events) return
			// Where our own request stream resumes. Only ever adopted when we have
			// nothing in flight (the relay chain is idle), so a poll landing between a
			// relay's send and its response can't rewind the counter under it.
			if (typeof data.clientSeq === 'number' && data.clientSeq > clientSeq && relaysPending === 0) {
				clientSeq = data.clientSeq
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
		if (throttled && pollTick % CONNECTED_POLL_EVERY_TICKS !== 0) return
		void poll()
	}

	// Pushed over the websocket the moment the server records a move. Events
	// carry the log sequence id, so ordering is checkable: apply the next id
	// directly, and on a gap (a lost push) backfill from the event log instead
	// of applying out of order.
	const onRealtimeEvent = (message: RealtimeMessage) => {
		const event = (message.payload as { event?: GameEvent } | null)?.event
		if (!event || typeof event.id !== 'number') return
		const outcome = pushBuffer.offer(event)
		if (outcome === 'stale') {
			logIncoming(event.id, event.action, 'push', 'stale')
			return
		}
		if (outcome === 'accepted') {
			// The socket handed us the next id in order. That is the only thing that
			// earns back the throttled poll.
			restorePushTrust()
			return
		}
		// Held (or dropped): there is a hole in front of it that only the log can
		// fill. Everything waiting is applied behind whatever this recovers.
		void poll()
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
		reportDesync(action, reason)
	}

	const relay = async (action: SerializedAction) => {
		busyNotified = false
		let budget = RELAY_ATTEMPTS
		for (let attempt = 0; attempt < budget; attempt++) {
			const outcome = await relayOnce(action, attempt)
			if (outcome === 'done') return
			if (typeof outcome === 'object') {
				// The server named a wait. Honour it instead of our own back-off
				// curve, and extend the budget so the move survives the cooldown.
				budget = Math.max(budget, RELAY_BUSY_ATTEMPTS)
				await wait(Math.min(outcome.retryAfterMs, MAX_BUSY_WAIT_MS))
				continue
			}
			await wait(RELAY_BACKOFF_MS[Math.min(attempt, RELAY_BACKOFF_MS.length - 1)])
		}
		// Out of attempts. The action is already on our board but not in the log, so
		// this client is ahead of the room. We deliberately do NOT consume an ordinal
		// — blocking the stream forever over one lost action would be worse than the
		// gap. The board is frozen from here: playing on against state the room never
		// accepted is what turns one lost action into an unplayable match.
		logOutgoing(action, 'failed', { error: 'exhausted-retries' })
		reportUnrelayed(action, 'action-lost')
	}

	/**
	 * One relay attempt. `retry` backs off on our own curve; `{ retryAfterMs }`
	 * is the server naming its own; `done` means stop, whatever the outcome was.
	 */
	type RelayOutcome = 'done' | 'retry' | { retryAfterMs: number }

	const relayOnce = async (action: SerializedAction, attempt: number): Promise<RelayOutcome> => {
		try {
			const res = await fetch(`/api/game/${gameSession}/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ event: action, clientSeq }),
			})
			if (res.status === 409) {
				// Our counter is out of step with the sender stream the server has —
				// typically a reload that restarted at 0. The response says where to
				// resume; adopt it and try again rather than letting the action drop.
				const data = (await res.json().catch(() => null)) as { expected?: number } | null
				if (typeof data?.expected === 'number' && data.expected !== clientSeq) {
					logOutgoing(action, 'failed', { status: 409, was: clientSeq, expected: data.expected })
					clientSeq = data.expected
					return 'retry'
				}
				// The counter already matches what the server expects and it still
				// refused, so retrying can only produce the same answer. The action is
				// on our board and nowhere else.
				logOutgoing(action, 'failed', { status: 409, attempt })
				reportUnrelayed(action, 'action-lost')
				return 'done'
			}
			if (res.status === 403) {
				// Rejected: the server disagrees about whose turn it is, so our board
				// has already applied something the room never accepted. Worth logging
				// loudly — it's a divergence, just one we caught at the source.
				// Nothing was recorded, so the ordinal stays unconsumed.
				logOutgoing(action, 'rejected', { status: 403 })
				flashWrongTurn()
				// The flash alone was not enough. It reads as "that click didn't take",
				// but the click DID take locally — this board and the room have disagreed
				// about the turn since whenever the first one was refused, and every
				// action after it compounds the split. Freeze and offer the resync.
				reportUnrelayed(action, 'action-refused')
				return 'done'
			}
			if (res.status === 429) {
				// The backend is rate limited, not refusing this move. Nothing was
				// recorded, so the ordinal stays unconsumed and re-sending the same
				// one is safe (the server dedupes on sender + clientSeq).
				const data = (await res.json().catch(() => null)) as { retryAfter?: number } | null
				const seconds =
					typeof data?.retryAfter === 'number' && data.retryAfter > 0 ? data.retryAfter : 2
				noteServiceBusy(seconds)
				logOutgoing(action, 'failed', { status: 429, attempt, retryAfter: seconds })
				if (!busyNotified) {
					// One toast, because the banner is already carrying the countdown —
					// this only has to explain why the board went quiet for a moment.
					busyNotified = true
					addToast('Servers are busy. Holding your move and retrying.', 'warn')
				}
				return { retryAfterMs: seconds * 1000 }
			}
			if (!res.ok) {
				// 5xx is worth another go; a 4xx we don't recognise is not.
				if (res.status >= 500) {
					logOutgoing(action, 'failed', { status: res.status, attempt })
					return 'retry'
				}
				logOutgoing(action, 'failed', { status: res.status })
				reportUnrelayed(action, 'action-lost')
				return 'done'
			}
			// Durably recorded — only now does this action own its ordinal.
			clientSeq += 1
			const result = (await res.json()) as { event?: GameEvent; turnDeadline?: number | null }
			if (result?.event && typeof result.event.id === 'number') {
				lastEventId = Math.max(lastEventId, result.event.id)
				appliedEventId = Math.max(appliedEventId, result.event.id)
				logOutgoing(action, 'sent', { eventId: result.event.id, clientSeq: clientSeq - 1 })
			} else {
				logOutgoing(action, 'sent', { clientSeq: clientSeq - 1 })
			}
			// An end-turn hands the fresh allowance to the opponent — reflect it
			// right away instead of waiting for the next poll.
			if (asyncGame && result?.turnDeadline !== undefined) deadline = result.turnDeadline
			return 'done'
		} catch {
			// The request never completed, so we can't know whether it landed. The
			// server dedupes on (sender, clientSeq), so re-sending the same ordinal is
			// safe: a retry of a request that actually succeeded returns the stored
			// event instead of appending a second copy.
			logOutgoing(action, 'failed', { error: 'network', attempt })
			return 'retry'
		}
	}

	// Outbound relays are chained, not fired in parallel. The server stamps each
	// event's `seq` when the request ARRIVES, so two overlapping POSTs can be
	// recorded in the opposite order to the one the player performed them in —
	// and the log is what every other client (and the replay) plays back. An
	// attack recorded before the move that set it up is unapplyable on arrival:
	// the attacker isn't on the tile yet, and the exchange is lost exactly as if
	// it had been dropped locally. One in flight at a time removes the race, at
	// the cost of a little latency on a burst, which turn-based play can afford.
	let relayChain: Promise<void> = Promise.resolve()
	/**
	 * How many relays the chain still owes. A counter, not a flag: with a flag, the
	 * `finally` of the action that just finished would clear it while the next one
	 * is already queued, and a poll could rewind `clientSeq` mid-stream.
	 */
	let relaysPending = 0

	const enqueueRelay = (action: SerializedAction) => {
		// One dedupe slot per relay, released when the relay settles. By then either
		// the echo has already claimed it, or `lastEventId` has moved past our own
		// event and the echo behind it will be skipped as stale — so holding the slot
		// any longer can only swallow somebody else's identical action later.
		const slot: SelfRelay = { fingerprint: JSON.stringify(action) }
		pendingSelf.push(slot)
		relaysPending += 1
		relayChain = relayChain
			.then(() => relay(action))
			.catch(() => {})
			.finally(() => {
				relaysPending -= 1
				releaseSelf(slot)
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

	const heartbeat = () => {
		void fetch(`/api/game/${gameSession}/heartbeat`, { method: 'POST' }).catch(() => {})
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
		// Presence: ping immediately, then on a steady interval, so leaving the
		// page stops the pings and the server can auto-resign us after the grace.
		// (For async rooms the server skips the absence sweep — the ping only
		// keeps last_seen fresh and drives the lazy deadline check.)
		heartbeat()
		heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL)
		if (asyncGame) clockTimer = setInterval(() => (clockNow = Date.now()), 1000)
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
		if (heartbeatTimer) clearInterval(heartbeatTimer)
		if (wrongTurnTimer) clearTimeout(wrongTurnTimer)
		if (clockTimer) clearInterval(clockTimer)
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
