<script lang="ts">
	import type { PageData } from './$types'
	import MapLoader from '$lib/Map/MapLoader.svelte'
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import GameBoard from '$lib/Map/GameBoard.svelte'
	import { socketEndTurn, socketSelect } from '$lib/Components/Socket/socket'
	import { dev } from '$app/environment'
	import PathDebugPanel from '$lib/Engine/Interactor/Pathing/PathDebugPanel.svelte'
	import PlayerRosterSync from '$lib/Engine/HUD/PlayerRosterSync.svelte'
	import GameChat from '$lib/Components/Socket/GameChat.svelte'

	export let data: PageData
	$: userSession = data.userSession
	$: gameSession = data.gameSession
	$: mapHash = data.mapHash
	// Authoritative side this client commands, resolved + assigned server-side
	// (see +page.server.ts). Replaces the old per-client re-derivation that let
	// both players end up as team 0.
	$: localTeam = data.localTeam ?? 0
	// Server sends profiles already keyed by team.
	$: teamRoster = data.roster ?? {}
</script>

<section class="h-screen overflow-clip">
	<MapLoader {mapHash} let:map>
		<PlayerRosterSync roster={teamRoster} />
		<GameSocket map={() => map} {gameSession} {userSession} let:socket let:requestRedraw>
			<GameStateManager
				{userSession}
				{gameSession}
				{map}
				minimap
				{localTeam}
				fogOfWar={map.fog ?? true}
				interactor={socket ? socketSelect(socket, () => map) : undefined}
				endTurnAction={socket ? socketEndTurn(socket, () => map) : undefined}
				let:select
			>
				<GameBoard {map} {requestRedraw} {select} fogOfWar={map.fog ?? true} menuHref="/rooms" />
			</GameStateManager>
		</GameSocket>
	</MapLoader>

	<!-- Realtime group chat for this room; click a name to open a private DM. -->
	<GameChat session={gameSession} roster={Object.values(teamRoster)} />

	<!-- DEV TOOL — movement/pathfinding diagnostics. dev-only (stripped from prod). -->
	{#if dev}
		<PathDebugPanel />
	{/if}
</section>
