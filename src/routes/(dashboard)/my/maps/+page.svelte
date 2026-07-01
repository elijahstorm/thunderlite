<script lang="ts">
	import Icon from '@iconify/svelte'
	import type { PageData } from './$types'
	import MapThumbnail from '$lib/Components/Widgets/Social/MapThumbnail.svelte'

	export let data: PageData
	$: maps = data.maps
	$: atLimit = data.remaining <= 0

	const formatDate = (date: Date | string) =>
		new Date(date).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		})
</script>

<section>
	<header class="mb-6 flex flex-wrap items-start justify-between gap-3">
		<div>
			<p class="section-eyebrow">Library</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">My Maps</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Maps you've created and saved.
				<span class="text-foreground font-medium">{maps.length}/{data.limit}</span> used.
			</p>
		</div>
		<a
			href="/editor"
			class="btn btn-primary"
			class:pointer-events-none={atLimit}
			class:opacity-50={atLimit}
			aria-disabled={atLimit}
			title={atLimit ? 'Map limit reached — delete one to create another' : 'Create a map'}
		>
			<Icon icon="lucide:hammer" width={14} />
			Create a map
		</a>
	</header>

	{#if atLimit}
		<div
			class="mb-6 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700"
		>
			<Icon icon="mdi:alert" width={15} />
			You've reached the limit of {data.limit} maps. Delete one to make room for another.
		</div>
	{/if}

	{#if maps.length === 0}
		<div class="card p-10 text-center space-y-4">
			<p class="text-sm text-muted-foreground">Nothing here yet.</p>
			<a href="/editor" class="btn btn-outline btn-sm">
				<Icon icon="lucide:hammer" width={14} />
				Open the map editor
			</a>
		</div>
	{:else}
		<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{#each maps as map (map.public_id)}
				<article class="card flex flex-col overflow-hidden transition-shadow hover:shadow-md">
					<a href="/map/{map.public_id}" class="block aspect-video bg-surface-2">
						<MapThumbnail {map} />
					</a>
					<div class="flex flex-1 flex-col gap-3 p-4">
						<div class="flex items-start justify-between gap-2">
							<h3 class="truncate text-base font-semibold tracking-tight text-foreground">
								{map.name ?? 'Unnamed map'}
							</h3>
							<span
								class="chip shrink-0 text-[10px] uppercase tracking-wide"
								class:text-muted-foreground={map.status !== 'public'}
							>
								{map.status === 'public' ? 'Public' : 'Private'}
							</span>
						</div>
						<div class="flex items-center gap-3 text-xs text-muted-foreground">
							<span class="inline-flex items-center gap-1.5">
								<Icon icon="lucide:play" width={13} />
								{map.plays ?? 0}
							</span>
							<span>{formatDate(map.updated_at ?? map.created_at)}</span>
						</div>
						<div class="mt-auto flex gap-2 pt-2">
							<a href="/editor/{map.public_id}" class="btn btn-outline btn-sm flex-1">
								<Icon icon="fluent:edit-24-filled" width={13} />
								Edit
							</a>
							<a href="/map/{map.public_id}" class="btn btn-ghost btn-sm flex-1">
								<Icon icon="lucide:external-link" width={13} />
								Open
							</a>
						</div>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</section>
