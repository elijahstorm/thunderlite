<script lang="ts">
	import { deriveFromHash } from './Editor/mapExporter'
	import { mapStore } from './mapStore'

	export let mapHash: string | undefined

	const map: MapObject = $mapStore ?? deriveFromHash(mapHash)

	mapStore.set(map)
</script>

<div class="p-6 h-screen">
	<slot {map} />
</div>
