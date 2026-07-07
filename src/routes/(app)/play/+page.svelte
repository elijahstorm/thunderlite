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
	import { derivePlayersFromMap } from '$lib/Engine/gameState'

	export let data: PageData
	$: userSession = data.userSession
	$: gameSession = data.gameSession
	$: mapHash = data.mapHash
	$: seat = data.seat ?? 0

	// Map the join seat to the side this client commands. The engine derives
	// players from the board in a stable (team-number) order, and turns rotate by
	// seat, so seat N is player N. Falls back to team 0 for a map with fewer sides
	// than seats.
	const localTeamFor = (map: MapObject, s: number): number =>
		derivePlayersFromMap(map)[s]?.team ?? 0

	// The server sends profiles indexed by join seat; re-key them by team using
	// that same stable seat → player order so the player list (which speaks in
	// teams) can look each side up. Any unresolved seat is skipped.
	const teamRosterFor = (
		map: MapObject,
		roster: (UserDBData | null)[] | undefined
	): Record<number, UserDBData> => {
		const out: Record<number, UserDBData> = {}
		if (!roster) return out
		const derived = derivePlayersFromMap(map)
		roster.forEach((user, s) => {
			const team = derived[s]?.team
			if (user && typeof team === 'number') out[team] = user
		})
		return out
	}
</script>

<section class="h-screen overflow-clip">
	<MapLoader {mapHash} let:map>
		<PlayerRosterSync roster={teamRosterFor(map, data.roster)} />
		<GameSocket map={() => map} {gameSession} {userSession} let:socket let:requestRedraw>
			<GameStateManager
				{userSession}
				{gameSession}
				{map}
				minimap
				localTeam={localTeamFor(map, seat)}
				fogOfWar={map.fog ?? true}
				interactor={socket ? socketSelect(socket, () => map) : undefined}
				endTurnAction={socket ? socketEndTurn(socket, () => map) : undefined}
				let:select
			>
				<GameBoard {map} {requestRedraw} {select} fogOfWar={map.fog ?? true} menuHref="/rooms" />
			</GameStateManager>
		</GameSocket>
	</MapLoader>

	<!-- DEV TOOL — movement/pathfinding diagnostics. dev-only (stripped from prod). -->
	{#if dev}
		<PathDebugPanel />
	{/if}
</section>
