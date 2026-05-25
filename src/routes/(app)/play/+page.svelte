<script lang="ts">
	import type { PageData } from './$types'
	import MapLoader from '$lib/Map/MapLoader.svelte'
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import MapRender from '$lib/Map/MapRender.svelte'
	import { socketEndTurn, socketSelect } from '$lib/Components/Socket/socket'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { writable } from 'svelte/store'

	export let data: PageData
	$: userSession = data.userSession
	$: gameSession = data.gameSession
	$: mapHash = data.mapHash

	const contextLoaded = writable(!!$rendererStore.ground[0]?.sprite)
</script>

<section class="h-screen overflow-clip">
	<MapLoader {mapHash} let:map>
		<GameSocket map={() => map} {gameSession} {userSession} let:socket let:requestRedraw>
			<GameStateManager
				{userSession}
				{gameSession}
				{map}
				interactor={socket ? socketSelect(socket, () => map) : undefined}
				endTurnAction={socket ? socketEndTurn(socket, () => map) : undefined}
				let:select
			>
				<MapRender {map} {requestRedraw} {select} fogOfWar />
			</GameStateManager>
		</GameSocket>

		{#if $contextLoaded}
			<div
				class="fixed right-0 top-0 border-l-2 border-b-2 border-black opacity-30 hover:opacity-100"
			>
				<MapRender mini pause fogOfWar {map} {contextLoaded} />
			</div>
		{/if}
	</MapLoader>
</section>
