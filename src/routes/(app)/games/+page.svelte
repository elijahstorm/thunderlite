<script lang="ts">
	import type { PageData } from './$types'
	import { onDestroy, onMount } from 'svelte'
	import { browser } from '$app/environment'
	import { invalidateAll } from '$app/navigation'
	import Icon from '@iconify/svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import AsyncGameCard from '$lib/Components/Games/AsyncGameCard.svelte'

	interface Props {
		data: PageData
	}

	let { data }: Props = $props()

	let games = $derived(data.asyncGames)
	// Three piles, in the order they want attention: your move, waiting on them,
	// and rooms that have not found an opponent yet.
	let yourMove = $derived(games.filter((g) => g.started && g.yourTurn))
	let theirMove = $derived(games.filter((g) => g.started && !g.yourTurn))
	let filling = $derived(games.filter((g) => !g.started))

	// One ticker for the whole page so every card's countdown reads down in step.
	// A minute is plenty: the shortest turn clock is twelve hours.
	let now = $state(Date.now())
	let tick: ReturnType<typeof setInterval> | null = null
	onMount(() => {
		if (!browser) return
		tick = setInterval(() => (now = Date.now()), 30_000)
	})
	onDestroy(() => tick && clearInterval(tick))

	let leaving: string | null = $state(null)
	const cancelRoom = async (session: string) => {
		if (leaving) return
		leaving = session
		try {
			await fetch(`/api/game/${session}/leave`, { method: 'POST' }).catch(() => {})
			await invalidateAll()
		} finally {
			leaving = null
		}
	}
</script>

<svelte:head>
	<title>{data.awaiting ? `(${data.awaiting}) ` : ''}Your games | ThunderLite</title>
</svelte:head>

<ContentWithFooter>
	<Header />

	<div class="container py-8 max-w-3xl space-y-8">
		<header class="flex flex-wrap items-end justify-between gap-4">
			<div class="max-w-xl">
				<p class="section-eyebrow">Your games</p>
				<h1 class="mt-1 text-3xl font-semibold tracking-tight text-foreground">
					{#if data.awaiting}
						{data.awaiting} {data.awaiting === 1 ? 'game needs' : 'games need'} your move
					{:else if games.length || data.liveRoom}
						Games in progress
					{:else}
						No games in progress
					{/if}
				</h1>
				{#if games.length || data.liveRoom}
					<p class="mt-1 text-sm text-muted-foreground">
						Async games wait for you. Take a turn whenever you like, and we will email you when it
						comes back around.
					</p>
				{/if}
			</div>
			{#if games.length || data.liveRoom}
				<a href="/make" class="btn btn-primary">
					<Icon icon="lucide:plus" width={14} />
					New game
				</a>
			{/if}
		</header>

		{#if data.liveRoom}
			<!-- Live play is one room at a time, so it reads as a banner rather than
			     as another entry in the correspondence list. -->
			<a
				href={data.liveRoom.started
					? `/play/${data.liveRoom.session}`
					: `/rooms/${data.liveRoom.session}`}
				class="card flex items-center gap-4 p-4 sm:p-5 transition-colors hover:bg-muted/40"
			>
				<span
					class="grid size-10 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-500"
				>
					<Icon icon="lucide:zap" width={18} />
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-sm font-semibold text-foreground">
						{data.liveRoom.started ? 'Live match in progress' : 'Live lobby open'}
					</span>
					<span class="block truncate text-xs text-muted-foreground">
						{data.liveRoom.mapName} · both players stay online for this one
					</span>
				</span>
				<Icon icon="lucide:chevron-right" width={18} class="shrink-0 text-muted-foreground" />
			</a>
		{/if}

		{#if yourMove.length}
			<section class="space-y-3" data-testid="your-move">
				<h2 class="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
					Your move
					<span
						class="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
					>
						{yourMove.length}
					</span>
				</h2>
				{#each yourMove as game (game.session)}
					<AsyncGameCard {game} {now} />
				{/each}
			</section>
		{/if}

		{#if theirMove.length}
			<section class="space-y-3" data-testid="their-move">
				<h2 class="text-sm font-semibold tracking-tight text-muted-foreground">
					Waiting on your opponent
				</h2>
				{#each theirMove as game (game.session)}
					<AsyncGameCard {game} {now} />
				{/each}
			</section>
		{/if}

		{#if filling.length}
			<section class="space-y-3" data-testid="filling">
				<h2 class="text-sm font-semibold tracking-tight text-muted-foreground">
					Looking for an opponent
				</h2>
				{#each filling as game (game.session)}
					<AsyncGameCard {game} {now} onleave={cancelRoom} leaving={leaving === game.session} />
				{/each}
			</section>
		{/if}

		{#if !games.length && !data.liveRoom}
			<div class="card border-dashed p-10 text-center">
				<Icon icon="lucide:hourglass" width={28} class="mx-auto text-muted-foreground" />
				<p class="mt-3 font-medium text-foreground">Nothing in flight</p>
				<p class="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
					Start an async game and you can take a turn a day for a week, or play live and finish it
					in one sitting.
				</p>
				<div class="mt-5 flex flex-wrap justify-center gap-2">
					<a href="/make" class="btn btn-primary">
						<Icon icon="lucide:plus" width={14} />
						Pick a map
					</a>
					<a href="/rooms" class="btn btn-outline">
						<Icon icon="lucide:users" width={14} />
						Find a live game
					</a>
				</div>
			</div>
		{/if}

		<footer class="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
			<p class="text-xs text-muted-foreground">
				Looking for a finished game? Your results live in
				<a href="/my/history" class="text-foreground underline underline-offset-2">match history</a
				>.
			</p>
			<a href="/rooms" class="btn btn-ghost btn-sm">
				<Icon icon="lucide:users" width={14} />
				Live rooms
			</a>
		</footer>
	</div>
</ContentWithFooter>
