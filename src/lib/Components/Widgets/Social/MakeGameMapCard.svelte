<script lang="ts">
	import { dbUsersStore } from '$lib/Stores/dbStores'
	import UserImageAndName from './UserImageAndName.svelte'

	export let map: MapDBData
</script>

<section class="space-y-5">
	<UserImageAndName user={$dbUsersStore[map.owner_auth]} text />

	<div class="grid gap-5 md:grid-cols-2">
		<div class="rounded-xl overflow-hidden border border-border bg-surface-2 aspect-video">
			<img
				src={map.thumbnail}
				alt="Map {map.name}"
				class="h-full w-full object-cover"
				height="400"
				width="600"
			/>
		</div>
		<div class="space-y-3">
			<h3 class="text-xl font-semibold tracking-tight text-foreground">
				{map.name ?? 'Unnamed map'}
			</h3>
			{#if map.description}
				<p class="text-sm text-muted-foreground leading-relaxed">{map.description}</p>
			{/if}
			<div class="flex flex-wrap gap-1.5 pt-1">
				<span class="chip">{map.type}</span>
				{#each map.info as info}
					<span class="chip">{info.info}</span>
				{/each}
			</div>
		</div>
	</div>
</section>
