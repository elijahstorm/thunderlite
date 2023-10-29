<script lang="ts">
	import type { PageData } from './$types'
	import MapEditor from '$lib/Map/MapEditor.svelte'

	export let data: PageData
	$: mapHash = data.mapHash
</script>

<MapEditor {mapHash} />
