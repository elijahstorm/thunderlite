<script lang="ts">
	import LocalInteracter from '$lib/Components/Socket/LocalInteracter.svelte'
	import MapRender from '$lib/Map/MapRender.svelte'
	import { deriveFromHash } from '$lib/Map/Editor/mapExporter'
	import { socketSelect } from '$lib/Components/Socket/socket'

	const map = deriveFromHash()
</script>

<section class="h-screen">
	<LocalInteracter map={() => map} let:socket let:requestRedraw>
		<MapRender {map} {requestRedraw} select={socketSelect(socket, () => map)} />
	</LocalInteracter>
</section>
