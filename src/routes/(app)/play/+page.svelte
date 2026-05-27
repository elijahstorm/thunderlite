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
				<MapRender {map} {requestRedraw} {select} fogOfWar backdrop="game-backdrop" />
			</GameStateManager>
		</GameSocket>

		{#if $contextLoaded}
			<div
				class="fixed right-3 top-3 overflow-hidden rounded-xl border border-border-strong opacity-40 shadow-lg ring-1 ring-black/5 backdrop-blur-sm transition-opacity duration-200 hover:opacity-100"
			>
				<MapRender mini pause fogOfWar {map} {contextLoaded} backdrop="bg-surface-2" />
			</div>
		{/if}
	</MapLoader>
</section>
