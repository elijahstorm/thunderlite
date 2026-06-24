<script lang="ts">
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import GameBoard from '$lib/Map/GameBoard.svelte'
	import { socketEndTurn, socketSelect } from '$lib/Components/Socket/socket'
	import { clearAnimations } from '$lib/Engine/Animator/animator'

	// A real, fully client-side match — the exact stack /dev/los uses. An
	// 'ephemeral' session makes GameSocket fall back to its LocalInteracter so the
	// board plays entirely in-browser. Every other team is CPU-controlled; set
	// `localTeam` to a value no player holds (e.g. -1) to spectate a CPU-vs-CPU run.
	export let map: MapObject
	export let localTeam = 0
	export let fogOfWar = false
	export let menuHref = '/dev'
	/** Bumped by the parent to force a fresh board (scene / weather change). */
	export let rebuildKey: string | number = 0

	const gameSession = 'ephemeral'

	// The animation overlays live in module-global stores driven by timers, so a
	// unit walking on the outgoing board would otherwise keep firing — and flash a
	// ghost overlay across the new map — after the keyed block below rebuilds. Tear
	// those animations down whenever the board identity changes (scene / team / fog).
	$: rebuildKey, localTeam, fogOfWar, clearAnimations()
</script>

{#key `${rebuildKey}|${localTeam}|${fogOfWar}`}
	<GameSocket map={() => map} {gameSession} let:socket let:requestRedraw>
		<GameStateManager
			{map}
			{gameSession}
			{localTeam}
			mode="hotseat"
			interactor={socket ? socketSelect(socket, () => map) : undefined}
			endTurnAction={socket ? socketEndTurn(socket, () => map) : undefined}
			let:select
		>
			<GameBoard {map} {requestRedraw} {select} {fogOfWar} {localTeam} {menuHref} />
		</GameStateManager>
	</GameSocket>
{/key}
