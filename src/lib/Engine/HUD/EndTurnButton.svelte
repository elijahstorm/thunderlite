<script lang="ts">
	import { gameState } from '../gameState'

	export let onEndTurn: () => void = () => {}

	$: state = $gameState
	$: disabled = state.phase !== 'playing'
</script>

<button
	type="button"
	class="px-3 py-1 rounded bg-black/70 text-white text-sm font-mono pointer-events-auto disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/80"
	data-testid="end-turn-button"
	{disabled}
	on:click={onEndTurn}
>
	End Turn
</button>
