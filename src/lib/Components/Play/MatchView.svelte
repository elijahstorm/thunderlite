<script lang="ts">
	import MapLoader from '$lib/Map/MapLoader.svelte'
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import GameBoard from '$lib/Map/GameBoard.svelte'
	import { socketEndTurn, socketSelect } from '$lib/Components/Socket/socket'
	import { dev } from '$app/environment'
	import PathDebugPanel from '$lib/Engine/Interactor/Pathing/PathDebugPanel.svelte'
	import PlayerRosterSync from '$lib/Engine/HUD/PlayerRosterSync.svelte'
	import GameChat from '$lib/Components/Socket/GameChat.svelte'
	import type { PublicKeyJwk } from '$lib/Security/frameSigning'

	/**
	 * The board itself, shared by both entry points: `/play/[session]` (a room
	 * addressed directly — how every async match is opened) and `/play` (the
	 * editor's ephemeral hand-off). Both loaders return this same shape, so the
	 * match view stays ignorant of which one resolved it.
	 */
	interface Props {
		userSession: string
		gameSession: string
		mapHash: string
		localTeam?: number
		roster?: Record<number, UserDBData>
		memberKeys?: Record<string, PublicKeyJwk>
		aiTeams?: number[]
		isAiDriver?: boolean
		asyncGame?: boolean
		turnDeadline?: number | null
		seed?: number | null
	}

	let {
		userSession,
		gameSession,
		mapHash,
		localTeam = 0,
		roster = {},
		memberKeys = {},
		aiTeams = [],
		isAiDriver = false,
		asyncGame = false,
		turnDeadline = null,
		seed = null,
	}: Props = $props()

	// Where the in-game menu goes when you back out. A correspondence match is
	// one of several you may have in flight, so it returns to the games hub that
	// lists them; a live match came from the matchmaking side of the site.
	let menuHref = $derived(asyncGame ? '/games' : '/rooms')
</script>

<section class="h-screen overflow-clip">
	<!-- Keyed on the room: SvelteKit reuses this component when only the route
	     param changes (/play/A -> /play/B, which is exactly what the HUD's "Next
	     game" jump does), and everything below snapshots its match once at mount
	     - MapLoader derives the board untracked, GameSocket subscribes to the
	     session it was built with. Without the key the URL changed and the board
	     did not, so the jump looked like a dead button. -->
	{#key gameSession}
		<MapLoader {mapHash}>
			{#snippet children({ map })}
				<PlayerRosterSync {roster} />
				<GameSocket
					map={() => map}
					{gameSession}
					{userSession}
					{memberKeys}
					{asyncGame}
					{turnDeadline}
					{aiTeams}
					{isAiDriver}
				>
					{#snippet children({
						socket,
						requestRedraw,
						aiTeams: liveAiTeams,
						isAiDriver: liveDriver,
					})}
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
							{asyncGame}
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
									{menuHref}
									{asyncGame}
								/>
							{/snippet}
						</GameStateManager>
					{/snippet}
				</GameSocket>
			{/snippet}
		</MapLoader>

		<!-- Realtime group chat for this room; click a name to open a private DM. -->
		<GameChat session={gameSession} roster={Object.values(roster)} />
	{/key}

	<!-- DEV TOOL — movement/pathfinding diagnostics. dev-only (stripped from prod). -->
	{#if dev}
		<PathDebugPanel />
	{/if}
</section>
