<script lang="ts">
	import type { PageData } from './$types'
	import MapLoader from '$lib/Map/MapLoader.svelte'

	export let data: PageData
</script>

<MapLoader mapHash={data?.mapHash} />
