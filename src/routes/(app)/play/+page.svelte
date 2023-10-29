<script lang="ts">
	import type { PageData } from './$types'
	import MapLoader from '$lib/Map/MapLoader.svelte'
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import MapRender from '$lib/Map/MapRender.svelte'
	import { socketSelect } from '$lib/Components/Socket/socket'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { writable } from 'svelte/store'

	export let data: PageData
	$: userSession = data.userSession
	$: gameSession = data.gameSession
	$: mapHash = data.mapHash

	const contextLoaded = writable(!!$rendererStore.ground[0]?.sprite)
</script>

<section class="m-auto">
	<MapLoader {mapHash} let:map>
		<GameSocket map={() => map} let:socket let:requestRedraw>
			<GameStateManager
				{userSession}
				{gameSession}
				interactor={socket ? socketSelect(socket, () => map) : undefined}
				let:select
			>
				<MapRender {map} {requestRedraw} {select} />
			</GameStateManager>
		</GameSocket>

		{#if $contextLoaded}
			<div class="fixed right-0 top-0 opacity-30 hover:opacity-100">
				<MapRender mini pause {map} {contextLoaded} />
			</div>
		{/if}
	</MapLoader>
</section>
