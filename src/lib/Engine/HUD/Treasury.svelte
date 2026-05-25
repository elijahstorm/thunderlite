<script lang="ts">
	import { gameState } from '../gameState'

	$: state = $gameState
	$: currentPlayer = state.players.find((p) => p.team === state.currentTeam)
	$: money = currentPlayer?.money ?? 0
</script>

<div
	class="fixed left-4 top-14 z-50 pointer-events-none select-none"
	data-testid="treasury"
>
	<span class="px-3 py-1 rounded bg-black/70 text-white text-sm font-mono">
		${money}
	</span>
</div>
