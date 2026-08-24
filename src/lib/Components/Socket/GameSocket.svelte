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
	import { outgoingActions } from '$lib/Engine/outgoingActions'
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

	// Opponent actions applied through a serial queue so their move/attack slides
	// play one at a time instead of overlapping. `caughtUp` gates animation: the
	// initial catch-up poll (and any gap backfill) applies instantly so a
	// reconnect doesn't replay the whole match in slow motion — only live pushes
	// once we're current get the full choreography.
	let caughtUp = false
	const animateQueue: SerializedAction[] = []
	let draining = false

	const drainQueue = async (): Promise<void> => {
		if (draining) return
		draining = true
		try {
			while (animateQueue.length) {
				const action = animateQueue.shift()!
				const m = map()
				if (!m) continue
				// Animate a lone, live move/attack; when actions have piled up
				// (a burst, or catching up), fast-forward instantly to stay in sync.
				const animate =
					animateQueue.length === 0 && (action.kind === 'move' || action.kind === 'attack')
				if (animate) {
					await animateRemoteAction(m, action)
				} else {
					dispatchSerializedAction(m, action)
				}
				requestRedraw = performance.now()
			}
		} finally {
			draining = false
		}
	}

	const applyEvent = (event: GameEvent, live: boolean): boolean => {
		const m = map()
		if (!m) return false
		if (typeof event.id !== 'number') return false
		if (event.id <= lastEventId) return true
		const action = normalizeAction(event.action)
		if (!action) {
			lastEventId = event.id
			return true
		}
		const fingerprint = JSON.stringify(action)
		if (locallyEmitted.has(fingerprint)) {
			// Our own action, already applied + animated locally when we made it.
			locallyEmitted.delete(fingerprint)
		} else if (live && caughtUp) {
			// A live opponent action: queue it so its slide can play.
			animateQueue.push(action)
			void drainQueue()
		} else {
			// Catch-up / backfill: apply immediately, no animation.
			dispatchSerializedAction(m, action)
		}
		lastEventId = event.id
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
			}
			if (!data?.events) return
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
				if (!applyEvent(evt, false)) break
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
		applyEvent(event, true)
	}

	const connectRealtime = async () => {
		const conn = new RealtimeConnection({
			channels: [`game:${gameSession}`],
			onStatus: (connected) => {
				realtimeUp = connected
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

	const relay = async (action: SerializedAction) => {
		try {
			const res = await fetch(`/api/game/${gameSession}/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ event: action }),
			})
			if (res.status === 403) {
				flashWrongTurn()
				return
			}
			if (!res.ok) return
			const result = (await res.json()) as { event?: GameEvent; turnDeadline?: number | null }
			if (result?.event && typeof result.event.id === 'number') {
				lastEventId = Math.max(lastEventId, result.event.id)
			}
			// An end-turn hands the fresh allowance to the opponent — reflect it
			// right away instead of waiting for the next poll.
			if (asyncGame && result?.turnDeadline !== undefined) deadline = result.turnDeadline
		} catch {
			// network errors swallowed; polling will pick up the canonical state.
		}
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
		void relay(action)
	}

	const socket = { send } as unknown as WebSocket

	const onOutgoing = (action: SerializedAction | null) => {
		if (!action) return
		if (!multiplayer) return
		locallyEmitted.add(JSON.stringify(action))
		void relay(action)
	}

	const heartbeat = () => {
		void fetch(`/api/game/${gameSession}/heartbeat`, { method: 'POST' }).catch(() => {})
	}

	onMount(() => {
		if (!browser) return
		multiplayer = isMultiplayer()
		if (!multiplayer) return
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
	})

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer)
		if (heartbeatTimer) clearInterval(heartbeatTimer)
		if (wrongTurnTimer) clearTimeout(wrongTurnTimer)
		if (clockTimer) clearInterval(clockTimer)
		if (outgoingUnsubscribe) outgoingUnsubscribe()
		realtimeConn?.close()
	})

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
