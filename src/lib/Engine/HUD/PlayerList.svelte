<script lang="ts">
	import { gameState } from '../gameState'
	import { teamColor } from '../teamColors'

	// Every player's funds, always on screen so they can be compared at a glance.
	// The active team is highlighted; defeated players are dimmed and struck.
	$: state = $gameState
	$: players = [...state.players].sort((a, b) => a.team - b.team)
</script>

<div
	class="flex flex-col gap-0.5 rounded bg-black/70 px-2 py-1.5 font-mono text-sm text-white select-none"
	data-testid="player-list"
>
	{#each players as player (player.team)}
		<div
			class="flex items-center gap-2 rounded px-1 py-0.5 transition-colors {player.team ===
			state.currentTeam
				? 'bg-white/15'
				: ''} {player.hasLost ? 'opacity-40' : ''}"
			data-testid="player-row"
			data-team={player.team}
		>
			<span
				class="inline-block h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/40"
				style="background:{teamColor(player.team)}"
			></span>
			<span class="flex-1 truncate {player.hasLost ? 'line-through' : ''}">
				{player.name ?? `Player ${player.team + 1}`}
			</span>
			<span class="tabular-nums" data-testid="player-money">${player.money}</span>
		</div>
	{/each}
</div>
