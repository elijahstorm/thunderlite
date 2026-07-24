<script lang="ts">
	import Icon from '@iconify/svelte'
	import type { PageData } from './$types'
	import MatchHistoryList from '$lib/Components/Profile/MatchHistoryList.svelte'

	interface Props {
		data: PageData
	}

	let { data }: Props = $props()
	let entries = $derived(data.entries)
	let totalPages = $derived(Math.max(1, Math.ceil(data.total / data.perPage)))
</script>

<svelte:head>
	<title>My Games | ThunderLite</title>
</svelte:head>

<section>
	<header class="mb-6">
		<p class="section-eyebrow">Battle log</p>
		<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">My Games</h1>
		<p class="text-sm text-muted-foreground mt-1">
			Every finished match, newest first. Online games keep their full move log, so you can watch
			them back at any time.
		</p>
	</header>

	{#if entries.length === 0}
		<div class="card p-8 text-center">
			<Icon icon="lucide:swords" width={28} class="mx-auto text-muted-foreground" />
			<p class="mt-3 font-medium text-foreground">No matches yet</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Finish a game and it will show up here, win or lose.
			</p>
			<a class="btn btn-primary mt-4" href="/rooms">Find a game</a>
		</div>
	{:else}
		<MatchHistoryList {entries} />

		{#if totalPages > 1}
			<nav class="mt-6 flex items-center justify-between" aria-label="History pages">
				{#if data.page > 1}
					<a class="btn btn-ghost btn-sm" href="?page={data.page - 1}">
						<Icon icon="lucide:chevron-left" width={14} />
						Newer
					</a>
				{:else}
					<span></span>
				{/if}
				<span class="text-xs text-muted-foreground">Page {data.page} of {totalPages}</span>
				{#if data.page < totalPages}
					<a class="btn btn-ghost btn-sm" href="?page={data.page + 1}">
						Older
						<Icon icon="lucide:chevron-right" width={14} />
					</a>
				{:else}
					<span></span>
				{/if}
			</nav>
		{/if}
	{/if}
</section>
