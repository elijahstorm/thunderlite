<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/stores'
	import Icon from '@iconify/svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import { campaignLevels, firstLevelOrder } from '$lib/Campaign/levels'
	import { getUnlockedOrder } from '$lib/Campaign/progress'

	// SSR renders with only the first level unlocked; the real value is read from
	// the local progress mirror after mount (localStorage is browser-only).
	let unlockedOrder = firstLevelOrder
	onMount(() => {
		unlockedOrder = getUnlockedOrder(undefined)
	})

	// Set when the player beat the final level and pressed Continue (see the host
	// route). Shown as a one-time banner; the grid is still browsable underneath.
	$: complete = $page.url.searchParams.get('complete') === '1'
</script>

<svelte:head>
	<title>Single Player Campaign | ThunderLite</title>
</svelte:head>

<ContentWithFooter>
	<Header />

	<section class="container py-16 space-y-8">
		<header class="space-y-2">
			<a
				href="/"
				class="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
			>
				<Icon icon="lucide:arrow-left" width={14} />
				Home
			</a>
			<h1 class="text-3xl font-semibold tracking-tight text-foreground">Single Player Campaign</h1>
			<p class="text-muted-foreground max-w-xl">
				Fight through the Reyes / Vance / Kael story one level at a time. Beat a level to unlock the
				next.
			</p>
		</header>

		{#if complete}
			<div
				class="card border-primary/40 bg-accent/40 p-5 flex items-center gap-3"
				data-testid="campaign-complete"
			>
				<Icon icon="lucide:trophy" width={22} class="text-primary" />
				<div>
					<div class="font-semibold text-foreground">Campaign complete</div>
					<p class="text-sm text-muted-foreground">
						You've cleared every level. Replay any of them below.
					</p>
				</div>
			</div>
		{/if}

		<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="level-list">
			{#each campaignLevels as level (level.id)}
				{@const locked = level.order > unlockedOrder}
				<li>
					{#if locked}
						<div
							class="card p-5 opacity-50 cursor-not-allowed"
							aria-disabled="true"
							data-testid="level-locked"
							data-level-id={level.id}
						>
							<div class="flex items-center justify-between">
								<span class="text-xs text-muted-foreground">Level {level.order}</span>
								<Icon icon="lucide:lock" width={16} class="text-muted-foreground" />
							</div>
							<h2 class="mt-2 text-base font-semibold text-foreground">{level.title}</h2>
							<p class="mt-1 text-sm text-muted-foreground">Locked</p>
						</div>
					{:else}
						<a
							href={`/campaign/${level.id}`}
							class="card p-5 block transition hover:border-primary/50 hover:shadow"
							data-testid="level-card"
							data-level-id={level.id}
						>
							<div class="flex items-center justify-between">
								<span class="text-xs text-muted-foreground">Level {level.order}</span>
								<Icon icon="lucide:play" width={16} class="text-primary" />
							</div>
							<h2 class="mt-2 text-base font-semibold text-foreground">{level.title}</h2>
							<p class="mt-1 text-sm text-muted-foreground">{level.blurb}</p>
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
</ContentWithFooter>
