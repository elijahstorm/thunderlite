<script lang="ts">
	import { gameState } from '../gameState'
	import { teamColor } from '../teamColors'
	import { playerRoster } from './playerRoster'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'

	// Every player's funds, always on screen so they can be compared at a glance.
	// The active team is highlighted; defeated players are dimmed and struck.
	$: state = $gameState
	$: players = [...state.players].sort((a, b) => a.team - b.team)

	// Online matches supply each side's real profile (keyed by team). Prefer the
	// display name, then the @username, then any engine-set label, and finally the
	// generic "Player N" for CPU/hotseat sides with no account behind them.
	$: roster = $playerRoster
	const labelFor = (player: (typeof players)[number], user: UserDBData | undefined): string =>
		user?.display_name || user?.username || player.name || `Player ${player.team + 1}`
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
			{#if roster[player.team]}
				<span class="shrink-0">
					<UserIcon user={roster[player.team]} size={1.15} noClick />
				</span>
			{/if}
			<span class="flex-1 truncate {player.hasLost ? 'line-through' : ''}">
				{labelFor(player, roster[player.team])}
			</span>
			<span class="tabular-nums" data-testid="player-money">${player.money}</span>
		</div>
	{/each}
</div>
