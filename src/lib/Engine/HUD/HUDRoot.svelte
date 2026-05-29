<script lang="ts">
	import TurnPill from './TurnPill.svelte'
	import Treasury from './Treasury.svelte'
	import EndTurnButton from './EndTurnButton.svelte'
	import TileInfoPanel from './TileInfoPanel.svelte'

	export let map: MapObject | undefined = undefined
	export let onEndTurn: () => void = () => {}
	export let localTeam: number = 0
	export let cpuOpponent: boolean = false
</script>

<div
	class="fixed right-4 top-4 z-50 flex flex-col gap-2 items-end pointer-events-none"
	data-testid="hud-root"
>
	<TurnPill />
	<Treasury />
	<EndTurnButton {onEndTurn} {localTeam} {cpuOpponent} />
	<TileInfoPanel {map} />
</div>
