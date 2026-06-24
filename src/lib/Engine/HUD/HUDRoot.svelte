<script lang="ts">
	import MapRender from '$lib/Map/MapRender.svelte'
	import TurnPill from './TurnPill.svelte'
	import PlayerList from './PlayerList.svelte'
	import EndTurnButton from './EndTurnButton.svelte'
	import TileInfoPanel from './TileInfoPanel.svelte'

	export let map: MapObject | undefined = undefined
	export let onEndTurn: () => void = () => {}
	export let localTeam: number = 0
	export let cpuOpponent: boolean = false
	/** Show the dimmed, hover-to-reveal overview map atop the HUD stack. */
	export let minimap: boolean = false
	export let fogOfWar: boolean = false
</script>

<!--
	The whole corner HUD is one continuous, top-right vertical stack: the overview
	minimap, the turn banner, the all-players funds list, then the turn controls.
	Keeping them in a single flex column means they never overlap regardless of how
	tall the minimap or tile panel grows.
-->
<div
	class="fixed right-4 top-4 z-50 flex flex-col gap-2 items-end pointer-events-none"
	data-testid="hud-root"
>
	{#if minimap && map}
		<div
			class="pointer-events-auto overflow-hidden rounded-xl border border-border-strong opacity-40 shadow-lg ring-1 ring-black/5 backdrop-blur-sm transition-opacity duration-200 hover:opacity-100"
		>
			<MapRender mini pause {fogOfWar} {map} backdrop="bg-surface-2" />
		</div>
	{/if}
	<TurnPill />
	<PlayerList />
	<EndTurnButton {onEndTurn} {localTeam} {cpuOpponent} />
	<TileInfoPanel {map} />
</div>
