<script lang="ts">
	import { gameState } from '../gameState'

	let state = $derived($gameState)
	let currentPlayer = $derived(state.players.find((p) => p.team === state.currentTeam))
	let turnLabel = $derived(
		state.phase === 'gameOver'
			? `Game Over${typeof state.winner === 'number' ? `: Player ${state.winner + 1} wins` : ''}`
			: `Turn ${state.turnNumber}: Player ${(state.currentTeam ?? 0) + 1}${
					currentPlayer?.name ? ` (${currentPlayer.name})` : ''
				}`
	)
</script>

<span
	class="px-3 py-1 rounded bg-black/70 text-white text-sm font-mono select-none"
	data-testid="turn-pill"
>
	{turnLabel}
</span>
