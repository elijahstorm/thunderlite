<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { browser } from '$app/environment'
	import LocalInteracter from '$lib/Engine/Interactor/LocalInteracter.svelte'
	import {
		dispatchSerializedAction,
		normalizeAction,
		type GameEvent,
		type SerializedAction,
	} from '$lib/Engine/Interactor/serializedAction'
	import { fly } from 'svelte/transition'

	export let map: () => MapObject | undefined
	export let gameSession: string = ''
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export let userSession: string = ''

	const POLL_INTERVAL = 1500

	const isMultiplayer = (): boolean => {
		if (!gameSession) return false
		if (gameSession === 'ephemeral') return false
		if (gameSession === 'testSession') return false
		return true
	}

	let multiplayer = false
	let lastEventId = -1
	let pollTimer: ReturnType<typeof setInterval> | null = null
	let requestRedraw: number = 0
	let wrongTurn = false
	let wrongTurnTimer: ReturnType<typeof setTimeout> | null = null

	const applyEvent = (event: GameEvent): boolean => {
		const m = map()
		if (!m) return false
		if (typeof event.id !== 'number') return false
		if (event.id <= lastEventId) return true
		const action = normalizeAction(event.action)
		if (!action) {
			lastEventId = event.id
			return true
		}
		dispatchSerializedAction(m, action)
		lastEventId = event.id
		requestRedraw = performance.now()
		return true
	}

	const poll = async () => {
		if (!multiplayer) return
		try {
			const res = await fetch(`/api/game/${gameSession}/events?since=${lastEventId}`)
			if (!res.ok) return
			const data = (await res.json()) as { events?: GameEvent[] }
			if (!data?.events) return
			for (const evt of data.events) {
				if (!applyEvent(evt)) break
			}
		} catch {
			// network errors are expected occasionally; keep polling.
		}
	}

	const flashWrongTurn = () => {
		wrongTurn = true
		if (wrongTurnTimer) clearTimeout(wrongTurnTimer)
		wrongTurnTimer = setTimeout(() => {
			wrongTurn = false
		}, 1500)
	}

	const send = async (data: string) => {
		let parsed: unknown
		try {
			parsed = JSON.parse(data)
		} catch {
			return
		}
		const action: SerializedAction | null = normalizeAction(parsed)
		if (!action) return
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
			const result = (await res.json()) as { event?: GameEvent }
			if (result?.event) applyEvent(result.event)
		} catch {
			// network errors swallowed; polling will pick up the canonical state.
		}
	}

	const socket = { send } as unknown as WebSocket

	onMount(() => {
		if (!browser) return
		multiplayer = isMultiplayer()
		if (!multiplayer) return
		void poll().then(() => {
			pollTimer = setInterval(poll, POLL_INTERVAL)
		})
	})

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer)
		if (wrongTurnTimer) clearTimeout(wrongTurnTimer)
	})
</script>

{#if multiplayer}
	<slot {socket} {requestRedraw} />
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
	<LocalInteracter {map} let:socket let:requestRedraw>
		<slot {socket} {requestRedraw} />
	</LocalInteracter>
{/if}
