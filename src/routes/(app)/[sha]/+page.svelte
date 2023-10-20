<script lang="ts">
	import type { PageData } from './$types'
	import MapLoader from '$lib/Map/MapLoader.svelte'
	import MapRender from '$lib/Map/MapRender.svelte'
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import { socketSelect } from '$lib/Components/Socket/socket'

	export let data: PageData
</script>

<MapLoader mapHash={data?.mapHash} let:map>
	<GameSocket map={() => map} let:socket>
		<MapRender {map} select={socket ? socketSelect(socket, () => map) : undefined} />
	</GameSocket>
</MapLoader>
