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

	interface Props {
		data: PageData
	}

	let { data }: Props = $props()
	let userSession = $derived(data.userSession)
	let gameSession = $derived(data.gameSession)
	let mapHash = $derived(data.mapHash)
	// Authoritative side this client commands, resolved + assigned server-side
	// (see +page.server.ts). Replaces the old per-client re-derivation that let
	// both players end up as team 0.
	let localTeam = $derived(data.localTeam ?? 0)
	// Server sends profiles already keyed by team.
	let teamRoster = $derived(data.roster ?? {})
	// Online CPU seats + whether this client drives them. These are the loader's
	// initial values; GameSocket re-reads them from the event poll and hands the
	// current pair back through its snippet, because the driver (the lowest-seat
	// human) can change mid-match when a player is swept for absence.
	let aiTeams = $derived(data.aiTeams ?? [])
	let isAiDriver = $derived(data.isAiDriver ?? false)
	// The room's stored seed. Shared by every client so a rejoin — or a client
	// that has never planned a CPU turn — draws the same randomness as everyone
	// else; null only for the editor's ephemeral hand-off.
	let seed = $derived(data.seed ?? null)
</script>

<section class="h-screen overflow-clip">
	<MapLoader {mapHash}>
		{#snippet children({ map })}
			<PlayerRosterSync roster={teamRoster} />
			<GameSocket
				map={() => map}
				{gameSession}
				{userSession}
				memberKeys={data.memberKeys ?? {}}
				asyncGame={data.asyncGame ?? false}
				turnDeadline={data.turnDeadline ?? null}
				{aiTeams}
				{isAiDriver}
			>
				{#snippet children({ socket, requestRedraw, aiTeams: liveAiTeams, isAiDriver: liveDriver })}
					<GameStateManager
						{userSession}
						{gameSession}
						{seed}
						{map}
						minimap
						{localTeam}
						aiTeams={liveAiTeams ?? aiTeams}
						isAiDriver={liveDriver ?? isAiDriver}
						fogOfWar={map.fog ?? true}
						interactor={socket ? socketSelect(socket, () => map) : undefined}
						endTurnAction={socket ? socketEndTurn(socket, () => map) : undefined}
					>
						{#snippet children({ select })}
							<GameBoard
								{map}
								{requestRedraw}
								{select}
								{localTeam}
								fogOfWar={map.fog ?? true}
								menuHref="/rooms"
							/>
						{/snippet}
					</GameStateManager>
				{/snippet}
			</GameSocket>
		{/snippet}
	</MapLoader>

	<!-- Realtime group chat for this room; click a name to open a private DM. -->
	<GameChat session={gameSession} roster={Object.values(teamRoster)} />

	<!-- DEV TOOL — movement/pathfinding diagnostics. dev-only (stripped from prod). -->
	{#if dev}
		<PathDebugPanel />
	{/if}
</section>
