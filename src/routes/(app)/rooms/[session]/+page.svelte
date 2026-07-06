<script lang="ts">
	import type { PageData } from './$types'
	import { onDestroy, onMount } from 'svelte'
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'
	import Icon from '@iconify/svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import { RealtimeConnection, type RealtimeMessage } from '$lib/dontcode/realtimeClient'

	export let data: PageData

	const POLL_INTERVAL = 1500
	const TICK_INTERVAL = 250

	let count = data.count
	let startAt: number | null = data.startAt
	const maxPlayers = data.maxPlayers
	const isHost = data.isHost
	const seat = data.seat
	const seatSlots = Array.from({ length: maxPlayers }, (_, i) => i)

	// Recomputed on a fast ticker so the countdown reads down smoothly.
	let now = Date.now()
	$: full = count >= maxPlayers
	$: remainingMs = startAt != null ? Math.max(0, startAt - now) : null
	$: remainingSecs = remainingMs != null ? Math.ceil(remainingMs / 1000) : null

	let starting = false
	let startError = ''
	let launched = false

	const launch = () => {
		if (launched) return
		launched = true
		if (browser) goto('/play')
	}

	// The single place the lobby decides it's time to play: `start_at` is set and
	// has arrived. Driven by both the poll (canonical state) and the ticker (so we
	// fire the instant the local countdown hits zero without waiting for a poll).
	$: if (startAt != null && now >= startAt) launch()

	const applyState = (state: { count?: number; startAt?: number | null }) => {
		if (typeof state.count === 'number') count = state.count
		// Never un-arm a countdown that's already running on this client.
		if (state.startAt != null) startAt = state.startAt
	}

	const poll = async () => {
		try {
			const res = await fetch(`/api/game/${data.session}`)
			if (res.status === 403 || res.status === 404) {
				// Kicked, expired, or the room vanished — back to the rooms hub.
				if (browser) goto('/rooms')
				return
			}
			if (!res.ok) return
			const body = (await res.json()) as { count?: number; startAt?: number | null }
			applyState(body)
		} catch {
			// Transient network error — the next tick retries.
		}
	}

	const startNow = async () => {
		if (starting || !full) return
		starting = true
		startError = ''
		try {
			const res = await fetch(`/api/game/${data.session}/start`, { method: 'POST' })
			const body = await res.json().catch(() => null)
			if (!res.ok) throw new Error(body?.message ?? 'Could not start the match')
			if (body?.startAt) startAt = body.startAt
		} catch (err) {
			startError = err instanceof Error ? err.message : 'Could not start the match'
		} finally {
			starting = false
		}
	}

	const copyCode = async () => {
		if (!browser || !navigator.clipboard) return
		try {
			await navigator.clipboard.writeText(data.session)
		} catch {
			// clipboard may be denied — ignore
		}
	}

	let pollTimer: ReturnType<typeof setInterval> | null = null
	let tickTimer: ReturnType<typeof setInterval> | null = null
	let conn: RealtimeConnection | null = null

	onMount(() => {
		if (!browser) return
		void poll()
		pollTimer = setInterval(poll, POLL_INTERVAL)
		tickTimer = setInterval(() => (now = Date.now()), TICK_INTERVAL)

		// Realtime accelerates the poll: the join/skip that changes lobby state
		// pushes a `{ lobby }` payload on the shared game channel. Best-effort —
		// the mock gateway has no realtime, so polling carries the lobby alone.
		const c = new RealtimeConnection({ channels: [`game:${data.session}`] })
		c.subscribe(`game:${data.session}`, (message: RealtimeMessage) => {
			const lobby = (message.payload as { lobby?: { count?: number; startAt?: number | null } })
				?.lobby
			if (lobby) applyState(lobby)
		})
		c.open()
			.then(() => (conn = c))
			.catch(() => c.close())
	})

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer)
		if (tickTimer) clearInterval(tickTimer)
		conn?.close()
	})
</script>

<ContentWithFooter>
	<Header />

	<div class="container py-8 max-w-2xl space-y-8">
		<header>
			<p class="section-eyebrow">Multiplayer</p>
			<h1 class="mt-1 text-3xl font-semibold tracking-tight text-foreground">Game lobby</h1>
			<p class="text-sm text-muted-foreground mt-1">
				{isHost ? 'You created this room.' : 'You joined this room.'} Map
				<span class="font-mono">{data.mapId}</span>
			</p>
		</header>

		<section class="card p-6 sm:p-8 space-y-5">
			<div class="space-y-1">
				<h2 class="text-lg font-semibold tracking-tight text-foreground">Invite a player</h2>
				<p class="text-sm text-muted-foreground">
					Share this code so a friend can join before the match begins.
				</p>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<code
					data-testid="session-code"
					class="px-3 py-2 rounded-md bg-muted text-foreground font-mono text-sm tracking-wide"
				>
					{data.session}
				</code>
				<button type="button" class="btn btn-outline btn-sm" on:click={copyCode}>
					<Icon icon="lucide:copy" width={14} />
					Copy
				</button>
			</div>
		</section>

		<section class="card p-6 sm:p-8 space-y-5">
			<div class="flex items-center justify-between gap-4">
				<h2 class="text-lg font-semibold tracking-tight text-foreground">Players</h2>
				<span class="text-sm text-muted-foreground font-mono">{count} / {maxPlayers}</span>
			</div>

			<ul class="space-y-2" data-testid="lobby-seats">
				{#each seatSlots as i (i)}
					<li
						class="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
						class:opacity-50={i >= count}
					>
						<Icon
							icon={i < count ? 'lucide:user-check' : 'lucide:user'}
							width={16}
							class={i < count ? 'text-foreground' : 'text-muted-foreground'}
						/>
						<span class="text-foreground">
							{i === 0 ? 'Host' : `Player ${i + 1}`}
							{#if i === seat}<span class="text-muted-foreground">(you)</span>{/if}
						</span>
						<span class="ml-auto text-xs text-muted-foreground">
							{i < count ? 'Ready' : 'Waiting…'}
						</span>
					</li>
				{/each}
			</ul>

			{#if full && remainingSecs != null}
				<div
					class="flex items-center gap-3 rounded-md bg-primary/5 border border-primary/30 p-3"
					data-testid="lobby-countdown"
				>
					<Icon icon="lucide:timer" width={18} class="text-primary" />
					<p class="text-sm text-foreground">
						Starting in <span class="font-mono font-semibold">{remainingSecs}s</span>…
					</p>
				</div>
			{:else}
				<p class="flex items-center gap-2 text-sm text-muted-foreground">
					<Icon icon="lucide:loader" width={16} class="animate-spin" />
					Waiting for another player to join…
				</p>
			{/if}

			{#if startError}
				<p
					class="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-3"
				>
					<Icon icon="lucide:circle-x" width={16} class="mt-0.5 shrink-0" />
					{startError}
				</p>
			{/if}

			<div class="flex flex-wrap items-center justify-end gap-2 pt-1">
				<a href="/rooms" class="btn btn-ghost btn-sm">
					<Icon icon="lucide:arrow-left" width={14} />
					Back to rooms
				</a>
				{#if isHost && full}
					<button
						type="button"
						class="btn btn-primary btn-sm"
						on:click={startNow}
						disabled={starting}
					>
						<Icon icon="lucide:play" width={14} />
						{starting ? 'Starting…' : 'Start now'}
					</button>
				{/if}
			</div>
		</section>
	</div>
</ContentWithFooter>
