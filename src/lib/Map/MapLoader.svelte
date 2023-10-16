<script lang="ts">
	import { deriveFromHash } from './Editor/mapExporter'
	import MapRender from './MapRender.svelte'
	import { mapStore } from './mapStore'

	export let mapHash: string | undefined

	const map: MapObject = $mapStore ?? deriveFromHash(mapHash)

	mapStore.set(map)
</script>

<div class="p-6 h-screen">
	<MapRender {map} />
</div>
