<script lang="ts">
	import { dbUsersStore } from '$lib/Stores/dbStores'
	import UserImageAndName from './UserImageAndName.svelte'

	export let map: MapDBData
</script>

<section class="mb-8">
	<UserImageAndName user={$dbUsersStore[map.owner_auth]} text />

	<div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
		<div>
			<img
				src={map.thumbnail}
				alt="Map {map.name}"
				class="w-full h-64 object-cover object-center rounded-lg"
				height="400"
				width="600"
				style="aspect-ratio:600/400;object-fit:cover"
			/>
		</div>
		<div class="space-y-2 max-h-64 my-auto overflow-y-auto">
			<h3 class="text-xl font-bold">{map.name ?? 'Unnamed'}</h3>
			<p class="text-zinc-500 dark:text-zinc-400">
				{map.description ?? ''}
			</p>
			<div class="pt-3 flex gap-x-4 gap-y-2 flex-wrap text-left">
				<div
					class="center relative border inline-block select-none whitespace-nowrap rounded-lg py-2 px-3.5 align-baseline font-sans text-xs font-semibold uppercase leading-none border-gray-500 text-gray-600 bg-gray-50"
				>
					<div class="mt-px">{map.type}</div>
				</div>
				<span class="text-gray-400 font-thin" class:hidden={!map.info.length}> | </span>
				{#each map.info as info}
					<div
						class="center relative border inline-block select-none whitespace-nowrap rounded-lg py-2 px-3.5 align-baseline font-sans text-xs font-semibold uppercase leading-none border-{info.color}-500 text-{info.color}-600 bg-{info.color}-50"
					>
						<div class="mt-px">{info.info}</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</section>
