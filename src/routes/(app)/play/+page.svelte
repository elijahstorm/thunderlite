<script lang="ts">
	import type { PageData } from './$types'
	import MapLoader from '$lib/Map/MapLoader.svelte'
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import GameBoard from '$lib/Map/GameBoard.svelte'
	import { socketEndTurn, socketSelect } from '$lib/Components/Socket/socket'
	import { dev } from '$app/environment'
	import PathDebugPanel from '$lib/Engine/Interactor/Pathing/PathDebugPanel.svelte'

	export let data: PageData
	$: userSession = data.userSession
	$: gameSession = data.gameSession
	$: mapHash = data.mapHash
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
				<GameBoard
					{map}
					{requestRedraw}
					{select}
					fogOfWar={map.fog ?? true}
					minimap
					menuHref="/rooms"
				/>
			</GameStateManager>
		</GameSocket>
	</MapLoader>

	<!-- DEV TOOL — movement/pathfinding diagnostics. dev-only (stripped from prod). -->
	{#if dev}
		<PathDebugPanel />
	{/if}
</section>
