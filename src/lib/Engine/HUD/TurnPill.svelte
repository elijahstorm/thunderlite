<script lang="ts">
	import { gameState } from '../gameState'

	export let onEndTurn: () => void = () => {}

	$: state = $gameState
	$: currentPlayer = state.players.find((p) => p.team === state.currentTeam)
	$: turnLabel =
		state.phase === 'gameOver'
			? `Game Over${typeof state.winner === 'number' ? ` — Player ${state.winner + 1} wins` : ''}`
			: `Turn ${state.turnNumber} — Player ${(state.currentTeam ?? 0) + 1}${
					currentPlayer?.name ? ` (${currentPlayer.name})` : ''
			  }`
	$: disabled = state.phase !== 'playing'
</script>

<div
	class="fixed left-4 top-4 flex items-center gap-2 z-50 pointer-events-none select-none"
	data-testid="turn-pill"
>
	<span class="px-3 py-1 rounded bg-black/70 text-white text-sm font-mono">
		{turnLabel}
	</span>
	<button
		type="button"
		class="px-3 py-1 rounded bg-black/70 text-white text-sm font-mono pointer-events-auto disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/80"
		data-testid="end-turn-button"
		{disabled}
		on:click={onEndTurn}
	>
		End Turn
	</button>
</div>
