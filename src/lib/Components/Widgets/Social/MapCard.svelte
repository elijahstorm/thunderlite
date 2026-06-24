<script lang="ts">
	import Icon from '@iconify/svelte'
	import { dbUsersStore } from '$lib/Stores/dbStores'
	import MapThumbnail from './MapThumbnail.svelte'
	import UserImageAndName from './UserImageAndName.svelte'

	export let map: MapDBData

	const formatDate = (date: Date | string) =>
		new Date(date).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		})

	const shortenNumber = (value: number) => {
		if (value >= 1e9) return (value / 1e9).toFixed(1) + 'b'
		if (value >= 1e6) return (value / 1e6).toFixed(1) + 'm'
		if (value >= 1e3) return (value / 1e3).toFixed(1) + 'k'
		return value.toString()
	}
</script>

<article class="card overflow-hidden transition-shadow hover:shadow-md">
	<div class="md:flex">
		<div class="md:w-56 md:shrink-0 bg-surface-2 aspect-video md:aspect-auto">
			<MapThumbnail {map} />
		</div>

		<div class="flex-1 p-5 sm:p-6 flex flex-col gap-4">
			<div class="flex items-start justify-between gap-3">
				<UserImageAndName user={$dbUsersStore[map.owner_auth]} text />
				<button
					type="button"
					class="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-secondary hover:bg-muted transition-colors"
					class:text-secondary={map.trending}
					aria-label={map.trending ? 'Featured map' : 'Mark as favorite'}
				>
					<Icon
						icon={map.trending ? 'lucide:star' : 'lucide:star'}
						width={18}
						class={map.trending ? 'fill-current' : ''}
					/>
				</button>
			</div>

			<div class="space-y-1.5">
				<h3 class="text-lg font-semibold tracking-tight text-foreground truncate">
					{map.name ?? 'Unnamed map'}
				</h3>
				{#if map.description}
					<p class="text-sm text-muted-foreground line-clamp-2">{map.description}</p>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-1.5">
				<span class="chip">{map.type}</span>
				{#each map.info as info}
					<span class="chip">{info.info}</span>
				{/each}
			</div>

			<div class="flex items-center justify-between gap-3 pt-2 mt-auto border-t border-border">
				<div class="flex items-center gap-4 text-xs text-muted-foreground pt-3">
					<span class="inline-flex items-center gap-1.5">
						<Icon
							icon="lucide:heart"
							width={14}
							class={map.liked_by_me ? 'fill-current text-destructive' : ''}
						/>
						{shortenNumber(map.likes ?? 0)}
					</span>
					<span class="inline-flex items-center gap-1.5">
						<Icon icon="lucide:play" width={14} />
						{shortenNumber(map.plays)}
					</span>
					<span class="inline-flex items-center gap-1.5">
						<Icon icon="lucide:share-2" width={14} />
						{shortenNumber(map.shares ?? 0)}
					</span>
				</div>
				<span class="text-xs text-muted-foreground pt-3">{formatDate(map.created_at)}</span>
			</div>
		</div>
	</div>
</article>
