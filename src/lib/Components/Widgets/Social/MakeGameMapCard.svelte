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
		<div class="flex flex-col justify-center">
			<h3 class="text-xl font-bold mb-2">{map.name ?? 'Unnamed'}</h3>
			<p class="text-zinc-500 dark:text-zinc-400">
				{map.description ?? ''}
			</p>
		</div>
	</div>
</section>
