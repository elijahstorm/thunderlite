<script lang="ts">
	import { gameState } from '../gameState'
	import { teamColor } from '../teamColors'
	import { playerRoster } from './playerRoster'

	interface Props {
		/** The viewing team, so the banner can call out "your turn". */
		localTeam?: number
		/** Collapsed rail: a colour dot and the turn number only. */
		compact?: boolean
	}

	let { localTeam = 0, compact = false }: Props = $props()

	let state = $derived($gameState)
	let roster = $derived($playerRoster)
	let over = $derived(state.phase === 'gameOver')
	let activeTeam = $derived(
		over && typeof state.winner === 'number' ? state.winner : state.currentTeam
	)
	let activePlayer = $derived(state.players.find((p) => p.team === activeTeam))
	let yours = $derived(!over && state.currentTeam === localTeam)

	// Same name resolution as the player list: real profile first (online), then
	// whatever the engine labelled the seat, then the generic fallback.
	let activeName = $derived(
		roster[activeTeam ?? 0]?.display_name ||
			roster[activeTeam ?? 0]?.username ||
			activePlayer?.name ||
			`Player ${(activeTeam ?? 0) + 1}`
	)

	// Read out in full even when the rail is collapsed (screen readers, tooltips).
	let label = $derived(
		over
			? typeof state.winner === 'number'
				? `Game over: ${activeName} wins`
				: 'Game over: draw'
			: `Turn ${state.turnNumber}: ${activeName}${yours ? ' (you)' : ''}`
	)
</script>

{#if compact}
	<div
		class="flex flex-col items-center gap-1"
		data-testid="turn-pill"
		title={label}
		aria-label={label}
	>
		<span
			class="h-2.5 w-2.5 rounded-full ring-2 ring-black/50"
			style="background:{teamColor(activeTeam ?? 0)}"
		></span>
		<span class="font-mono text-[10px] leading-none tabular-nums text-white/55">
			{state.turnNumber}
		</span>
		<span class="sr-only">{label}</span>
	</div>
{:else}
	<div class="min-w-0 flex-1 select-none" data-testid="turn-pill">
		<div class="flex items-center justify-between gap-2">
			<span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
				{over ? 'Game Over' : `Turn ${state.turnNumber}`}
			</span>
			{#if yours}
				<span
					class="rounded-full bg-emerald-400/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-emerald-300"
				>
					You
				</span>
			{/if}
		</div>
		<div class="mt-0.5 flex items-center gap-2">
			<span
				class="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-black/50"
				style="background:{teamColor(activeTeam ?? 0)}"
			></span>
			<span class="truncate text-sm font-semibold leading-tight text-white/95">
				{over && typeof state.winner !== 'number' ? 'Draw' : activeName}
			</span>
		</div>
		<span class="sr-only">{label}</span>
	</div>
{/if}
