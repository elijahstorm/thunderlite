<script lang="ts">
	import type { PageData } from './$types'
	import MapEditor from '$lib/Map/MapEditor.svelte'

	interface Props {
		data: PageData
	}

	let { data }: Props = $props()
	let mapHash = $derived(data.mapHash)
	let mapId = $derived(data.mapId)
	let mapName = $derived(data.mapName)
</script>

<MapEditor {mapHash} {mapId} {mapName} />
