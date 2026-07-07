<script lang="ts">
	import { gameState } from '../gameState'
	import { turnTransitionActive } from './turnTransitionStore'

	interface Props {
		onEndTurn?: () => void
		localTeam?: number
		/** True when other teams are CPU. Hotseat passes false so both human players
		 * can end their own turn from the same client. */
		cpuOpponent?: boolean
	}

	let { onEndTurn = () => {}, localTeam = 0, cpuOpponent = false }: Props = $props()

	let state = $derived($gameState)
	let disabled = $derived(
		state.phase !== 'playing' ||
			(cpuOpponent && state.currentTeam !== localTeam) ||
			$turnTransitionActive
	)
</script>

<button
	type="button"
	class="px-3 py-1 rounded bg-black/70 text-white text-sm font-mono pointer-events-auto disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/80"
	data-testid="end-turn-button"
	{disabled}
	onclick={onEndTurn}
>
	End Turn
</button>
