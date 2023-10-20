<script lang="ts">
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import MapRender from '$lib/Map/MapRender.svelte'
	import { deriveFromHash } from '$lib/Map/Editor/mapExporter'
	import { socketSelect } from '$lib/Components/Socket/socket'

	const map = deriveFromHash()
</script>

<section class="h-screen">
	<GameSocket let:socket map={() => map}>
		<MapRender {map} select={socket ? socketSelect(socket, () => map) : undefined} />
	</GameSocket>
</section>
