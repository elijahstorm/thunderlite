<script lang="ts">
	import { createImageLoader } from '$lib/Sprites/images'
	import { deriveFromHash } from './Editor/mapExporter'
	import MapRender from './MapRender.svelte'
	import { loadedState, mapStore } from './mapStore'

	export let mapHash: string | undefined

	const loadChecker = (finished: boolean) => loadedState.set(finished)

	const map: MapObject = $mapStore ?? deriveFromHash(mapHash)

	mapStore.set(map)
</script>

<div class="p-6 h-screen">
	<MapRender
		{map}
		select={undefined}
		makeImage={createImageLoader(loadChecker)}
		loaded={$loadedState}
	/>
</div>
