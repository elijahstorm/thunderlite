<script lang="ts">
	import { deriveFromHash } from './Editor/mapExporter'
	import { playMapStore } from './mapStore'

	export let mapHash: string | undefined

	const map: MapObject = $playMapStore ?? deriveFromHash(mapHash)

	// Consume the hand-off so a refresh re-derives from `mapHash` cleanly
	// instead of replaying a mutated in-memory map.
	playMapStore.set(null)
</script>

<slot {map}></slot>
