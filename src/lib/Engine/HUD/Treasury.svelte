<script lang="ts">
	import { gameState } from '../gameState'

	let state = $derived($gameState)
	let currentPlayer = $derived(state.players.find((p) => p.team === state.currentTeam))
	let money = $derived(currentPlayer?.money ?? 0)
</script>

<span
	class="px-3 py-1 rounded bg-black/70 text-white text-sm font-mono select-none"
	data-testid="treasury"
>
	${money}
</span>
