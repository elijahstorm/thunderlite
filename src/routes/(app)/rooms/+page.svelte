<script lang="ts">
	import type { PageData } from './$types'
	import { browser } from '$app/environment'
	import { page as pageStore } from '$app/stores'
	import { goto, invalidateAll } from '$app/navigation'
	import Icon from '@iconify/svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import InviteLink from '$lib/Components/Games/InviteLink.svelte'
	import { formatTurnTimeout } from '$lib/Game/asyncConfig'

	interface Props {
		data: PageData
	}

	let { data }: Props = $props()

	let gameData = $derived(data.gameData)
	// Set by the in-app layout load; surfaced here as a nudge because someone on
	// the matchmaking page is looking for something to play, and they may already
	// have a move waiting elsewhere.
	let awaitingTurns = $derived(($pageStore.data.awaitingTurns as number | undefined) ?? 0)

	let joinCode = $state('')
	let joinStatus: 'idle' | 'sending' | 'error' = $state('idle')
	let joinError = $state('')

	const joinSession = async (session: string) => {
		if (!session) {
			joinStatus = 'error'
			joinError = 'Please enter a room code'
			return
		}
		joinStatus = 'sending'
		joinError = ''
		try {
			const response = await fetch('/api/game/join', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-sveltekit-action': 'true',
				},
				body: JSON.stringify({ session }),
			})
			const body = await response.json().catch(() => null)
			if (!response.ok) {
				throw new Error(body?.message ?? 'Could not join that room')
			}
			if (browser) {
				// Into the lobby, not straight into the match — the host may still be
				// waiting there, and this is where the start countdown plays out.
				goto(`/rooms/${session}`)
				return
			}
			joinStatus = 'idle'
		} catch (err) {
			joinStatus = 'error'
			joinError = err instanceof Error ? err.message : 'Could not join that room'
		}
	}

	const join = () => joinSession(joinCode.trim())

	let leaving = $state(false)
	const leaveActive = async (session: string) => {
		if (leaving) return
		leaving = true
		try {
			await fetch(`/api/game/${session}/leave`, { method: 'POST' }).catch(() => {})
			await invalidateAll()
		} finally {
			leaving = false
		}
	}
</script>

<svelte:head>
	<title>Live Rooms | ThunderLite</title>
</svelte:head>

<ContentWithFooter>
	<Header />

	<div class="container py-8 max-w-3xl space-y-6">
		<header class="flex flex-wrap items-end justify-between gap-4">
			<div class="max-w-xl">
				<p class="section-eyebrow">Multiplayer</p>
				<h1 class="mt-1 text-3xl font-semibold tracking-tight text-foreground">Live rooms</h1>
				<p class="mt-1 text-sm text-muted-foreground">
					Games played start to finish in one sitting. Join an open room, or use a code a friend
					sent you.
				</p>
			</div>
			<a href="/make" class="btn btn-primary">
				<Icon icon="lucide:plus" width={14} />
				Host a game
			</a>
		</header>

		{#if awaitingTurns}
			<!-- Async lives on /games now, so the one thing this page owes it is a
			     way back when there is a move waiting. -->
			<a
				href="/games"
				class="card flex items-center gap-3 border-primary/40 bg-primary/[0.04] p-4 transition-colors hover:bg-primary/[0.07]"
			>
				<Icon icon="lucide:hourglass" width={18} class="shrink-0 text-primary" />
				<span class="min-w-0 flex-1 text-sm text-foreground">
					{awaitingTurns} async {awaitingTurns === 1 ? 'game is' : 'games are'} waiting on your move
				</span>
				<span class="shrink-0 text-xs font-medium text-primary">Your games</span>
				<Icon icon="lucide:chevron-right" width={16} class="shrink-0 text-primary" />
			</a>
		{/if}

		{#if gameData}
			<section class="card space-y-5 p-6 sm:p-8">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="text-lg font-semibold tracking-tight text-foreground">
							{gameData.started ? 'Your match is in progress' : 'Your room is open'}
						</h2>
						<p class="mt-0.5 text-sm text-muted-foreground">{gameData.mapName}</p>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						{#if gameData.started}
							<a href="/play/{gameData.session}" class="btn btn-primary btn-sm">
								<Icon icon="lucide:play" width={14} />
								Rejoin match
							</a>
						{:else}
							<a href="/rooms/{gameData.session}" class="btn btn-primary btn-sm">
								<Icon icon="lucide:arrow-right" width={14} />
								Go to lobby
							</a>
						{/if}
						<button
							type="button"
							class="btn btn-ghost btn-sm text-destructive"
							disabled={leaving}
							onclick={() => gameData && leaveActive(gameData.session)}
						>
							<Icon icon="lucide:log-out" width={14} />
							{leaving ? 'Leaving…' : 'Leave'}
						</button>
					</div>
				</div>

				{#if !gameData.started}
					<InviteLink session={gameData.session} label="Invite a player" />
				{/if}
			</section>
		{/if}

		<section class="card space-y-4 p-6 sm:p-8">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="text-lg font-semibold tracking-tight text-foreground">Open rooms</h2>
					<p class="text-sm text-muted-foreground">Public games still short a player.</p>
				</div>
				<a
					class="btn btn-ghost btn-sm"
					href="/rooms{data.page ? `?page=${data.page}` : ''}"
					data-sveltekit-reload
					aria-label="Refresh the room list"
				>
					<Icon icon="lucide:refresh-cw" width={14} />
					Refresh
				</a>
			</div>

			{#if data.openRooms?.length}
				<ul class="space-y-2">
					{#each data.openRooms as room (room.session)}
						<li
							class="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
						>
							<span
								class="grid size-9 shrink-0 place-items-center rounded-full {room.mode === 'async'
									? 'bg-primary/10 text-primary'
									: 'bg-amber-500/10 text-amber-500'}"
							>
								<Icon icon={room.mode === 'async' ? 'lucide:hourglass' : 'lucide:zap'} width={16} />
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-foreground">{room.mapName}</p>
								<p class="mt-0.5 text-xs text-muted-foreground">
									{room.mode === 'async'
										? `Async${room.turnTimeoutMs != null ? ` · ${formatTurnTimeout(room.turnTimeoutMs)} per turn` : ''}`
										: 'Live'}
									<span class="text-muted-foreground/60">·</span>
									<span class="font-mono">{room.count}/{room.maxPlayers} seats</span>
								</p>
							</div>
							<button
								type="button"
								class="btn btn-primary btn-sm shrink-0"
								disabled={joinStatus === 'sending'}
								onclick={() => joinSession(room.session)}
							>
								<Icon icon="lucide:log-in" width={14} />
								Join
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="rounded-lg border border-dashed border-border p-8 text-center">
					<Icon icon="lucide:users" width={24} class="mx-auto text-muted-foreground" />
					<p class="mt-2 text-sm font-medium text-foreground">Nobody is hosting right now</p>
					<p class="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
						Live games need someone on the other side at the same time. An async game does not: your
						opponent can join and move while you are away.
					</p>
					<a href="/make" class="btn btn-outline btn-sm mt-4">
						<Icon icon="lucide:hourglass" width={14} />
						Start an async game
					</a>
				</div>
			{/if}

			{#if data.page > 0 || data.hasMore}
				<div class="flex items-center justify-between pt-1">
					<a
						class="btn btn-outline btn-sm"
						class:pointer-events-none={data.page === 0}
						class:opacity-50={data.page === 0}
						href="/rooms?page={Math.max(0, data.page - 1)}"
					>
						<Icon icon="lucide:chevron-left" width={14} />
						Newer
					</a>
					<span class="text-xs text-muted-foreground">Page {data.page + 1}</span>
					<a
						class="btn btn-outline btn-sm"
						class:pointer-events-none={!data.hasMore}
						class:opacity-50={!data.hasMore}
						href="/rooms?page={data.page + 1}"
					>
						Older
						<Icon icon="lucide:chevron-right" width={14} />
					</a>
				</div>
			{/if}
		</section>

		<section class="card space-y-4 p-6 sm:p-8">
			<div>
				<h2 class="text-lg font-semibold tracking-tight text-foreground">Have a code?</h2>
				<p class="text-sm text-muted-foreground">
					Paste the room code a friend sent you. Invite links join you automatically.
				</p>
			</div>

			<form
				class="flex flex-col gap-2 sm:flex-row"
				onsubmit={(e) => {
					e.preventDefault()
					join()
				}}
			>
				<input
					type="text"
					bind:value={joinCode}
					placeholder="Room code"
					autocomplete="off"
					class="input flex-1 font-mono"
					disabled={joinStatus === 'sending'}
				/>
				<button type="submit" class="btn btn-primary" disabled={joinStatus === 'sending'}>
					{joinStatus === 'sending' ? 'Joining…' : 'Join'}
				</button>
			</form>

			{#if joinStatus === 'error' && joinError}
				<p
					class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
				>
					<Icon icon="lucide:circle-x" width={16} class="mt-0.5 shrink-0" />
					{joinError}
				</p>
			{/if}
		</section>
	</div>
</ContentWithFooter>
