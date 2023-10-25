<script lang="ts">
	import { deriveFromHash } from './Editor/mapExporter'
	import { mapStore } from './mapStore'

	export let mapHash: string | undefined

	const map: MapObject = $mapStore ?? deriveFromHash(mapHash)

	mapStore.set(map)
</script>

<slot {map} />
