<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte'
	import { browser } from '$app/environment'
	import LocalInteracter from '$lib/Engine/Interactor/LocalInteracter.svelte'
	import {
		dispatchSerializedAction,
		normalizeAction,
		type GameEvent,
		type SerializedAction,
	} from '$lib/Engine/Interactor/serializedAction'
	import { animateRemoteAction } from '$lib/Engine/remoteAnimate'
	import { createEventQueue } from './eventQueue'
	import { outgoingActions } from '$lib/Engine/outgoingActions'
	import { desyncReports, resetDesync } from '$lib/Engine/desync'
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
	// With a live websocket, polling drops to a slow reconciliation pass that
	// only exists to catch a push the fire-and-forget channel lost.
	const CONNECTED_POLL_EVERY_TICKS = 20
	// Presence ping — keeps our `last_seen` fresh so the server doesn't auto-resign
	// us, and drives the sweep that resigns an opponent who left. Independent of the
	// event poll, which throttles to ~30s once realtime is connected.
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
	let outgoingUnsubscribe: (() => void) | null = null
	let requestRedraw: number = $state(0)
	let wrongTurn = $state(false)
	let wrongTurnTimer: ReturnType<typeof setTimeout> | null = null
	const locallyEmitted = new Set<string>()

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
		animate: (action) => animateRemoteAction(map()!, action),
		apply: (action) => dispatchSerializedAction(map()!, action),
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
		if (locallyEmitted.has(fingerprint)) {
			// Our own action, already applied + animated locally when we made it.
			locallyEmitted.delete(fingerprint)
			appliedEventId = event.id
			logIncoming(event.id, action, via, 'deduped')
			if (action.kind === 'end-turn') checkpoint(m, event.id, 'local-end-turn')
			requestRedraw = performance.now()
			return true
		}
		// Queue it — never apply here. Applying an event while an earlier one is
		// still animating is exactly what desynced matches; see `eventQueue.ts`.
		queue.push({ id: event.id, action, animate: via === 'push' && caughtUp, via })
		logIncoming(event.id, action, via, 'queued')
		requestRedraw = performance.now()
		return true
	}

	const poll = async () => {
		if (!multiplayer) return
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
		} catch {
			// network errors are expected occasionally; keep polling.
		}
	}

	const pollTimerTick = () => {
		pollTick += 1
		if (realtimeUp && pollTick % CONNECTED_POLL_EVERY_TICKS !== 0) return
		void poll()
	}

	// Pushed over the websocket the moment the server records a move. Events
	// carry the log sequence id, so ordering is checkable: apply the next id
	// directly, and on a gap (a lost push) backfill from the event log instead
	// of applying out of order.
	const onRealtimeEvent = (message: RealtimeMessage) => {
		const event = (message.payload as { event?: GameEvent } | null)?.event
		if (!event || typeof event.id !== 'number') return
		if (event.id > lastEventId + 1) {
			void poll()
			return
		}
		applyEvent(event, 'push')
	}

	const connectRealtime = async () => {
		const conn = new RealtimeConnection({
			channels: [`game:${gameSession}`],
			onStatus: (connected) => {
				realtimeUp = connected
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

	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

	const relay = async (action: SerializedAction) => {
		for (let attempt = 0; attempt < RELAY_ATTEMPTS; attempt++) {
			const outcome = await relayOnce(action, attempt)
			if (outcome !== 'retry') return
			await wait(RELAY_BACKOFF_MS[Math.min(attempt, RELAY_BACKOFF_MS.length - 1)])
		}
		// Out of attempts. The action is already on our board but not in the log, so
		// this client is ahead of the room. We deliberately do NOT consume an ordinal
		// — blocking the stream forever over one lost action would be worse than the
		// gap, and the digest checkpoints will surface the divergence.
		logOutgoing(action, 'failed', { error: 'exhausted-retries' })
	}

	const relayOnce = async (
		action: SerializedAction,
		attempt: number
	): Promise<'done' | 'retry'> => {
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
				logOutgoing(action, 'failed', { status: 409, attempt })
				return 'done'
			}
			if (res.status === 403) {
				// Rejected: the server disagrees about whose turn it is, so our board
				// has already applied something the room never accepted. Worth logging
				// loudly — it's a divergence, just one we caught at the source.
				// Nothing was recorded, so the ordinal stays unconsumed.
				logOutgoing(action, 'rejected', { status: 403 })
				flashWrongTurn()
				return 'done'
			}
			if (!res.ok) {
				// 5xx is worth another go; a 4xx we don't recognise is not.
				if (res.status >= 500) {
					logOutgoing(action, 'failed', { status: res.status, attempt })
					return 'retry'
				}
				logOutgoing(action, 'failed', { status: res.status })
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
		relaysPending += 1
		relayChain = relayChain
			.then(() => relay(action))
			.catch(() => {})
			.finally(() => {
				relaysPending -= 1
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
		locallyEmitted.add(JSON.stringify(action))
		enqueueRelay(action)
	}

	const socket = { send } as unknown as WebSocket

	const onOutgoing = (action: SerializedAction | null) => {
		if (!action) return
		if (!multiplayer) return
		locallyEmitted.add(JSON.stringify(action))
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
			desynced = { reason: report.reason, action: report.action.kind }
			if (desyncsLogged >= MAX_DESYNC_REPORTS) return
			desyncsLogged += 1
			const m = map()
			logDesync(
				appliedEventId,
				report.action,
				report.reason,
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
	 * order, which rebuilds exactly the state the room agrees on. Offered rather
	 * than forced — yanking the page out from under someone mid-turn is worse than
	 * letting them finish the beat and press the button.
	 */
	const resync = () => {
		logNote('resync-requested', { lastEventId, appliedEventId })
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
			<span>Out of sync with your opponent.</span>
			<button class="underline font-semibold" onclick={resync} data-testid="desync-resync"
				>Resync now</button
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
