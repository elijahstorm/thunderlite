<script lang="ts">
	import Icon from '@iconify/svelte'
	import { gameState } from '../gameState'
	import { turnTransitionActive } from './turnTransitionStore'

	interface Props {
		onEndTurn?: () => void
		/** Whether the side currently holding the turn is one this client commands.
		 * The parent owns this (it knows localTeam, the CPU seats and whether the
		 * match is online); the button only renders the answer. It used to be
		 * derived here from a `cpuOpponent` flag, which was false for every ONLINE
		 * match — so the button stayed live on the opponent's turn, ended their turn
		 * on this board only, and desynced the match. */
		canEndTurn?: boolean
		/** Collapsed rail: icon-only. */
		compact?: boolean
	}

	let { onEndTurn = () => {}, canEndTurn = true, compact = false }: Props = $props()

	let state = $derived($gameState)
	let disabled = $derived(state.phase !== 'playing' || !canEndTurn || $turnTransitionActive)
	// Say *why* the button is dead rather than just greying out — waiting on the
	// other side is the common case and used to look like a broken button.
	let label = $derived(
		state.phase !== 'playing' ? 'Match over' : !canEndTurn ? "Opponent's turn" : 'End Turn'
	)
</script>

<button
	type="button"
	class="group flex w-full items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed {compact
		? 'h-8 px-0 text-xs'
		: 'px-3 py-2 text-sm'} {disabled
		? 'bg-white/5 text-white/35'
		: 'bg-emerald-500/90 text-emerald-950 shadow-sm hover:bg-emerald-400'}"
	data-testid="end-turn-button"
	title={label}
	aria-label={label}
	{disabled}
	onclick={onEndTurn}
>
	{#if compact}
		<Icon icon="mdi:skip-next" width="18" height="18" />
		<span class="sr-only">{label}</span>
	{:else}
		<span class="truncate">{label}</span>
		{#if !disabled}
			<Icon icon="mdi:skip-next" width="16" height="16" />
		{/if}
	{/if}
</button>
