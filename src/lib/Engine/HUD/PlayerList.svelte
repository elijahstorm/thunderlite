<script lang="ts">
	import { gameState } from '../gameState'
	import { teamColor } from '../teamColors'
	import { playerRoster } from './playerRoster'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'

	// Every player's funds, always on screen so they can be compared at a glance.
	// The active team gets a team-coloured edge and a lifted row; defeated players
	// are dimmed and struck through.
	let state = $derived($gameState)
	let players = $derived([...state.players].sort((a, b) => a.team - b.team))

	// Online matches supply each side's real profile (keyed by team). Prefer the
	// display name, then the @username, then any engine-set label, and finally the
	// generic "Player N" for CPU/hotseat sides with no account behind them.
	let roster = $derived($playerRoster)
	const labelFor = (player: (typeof players)[number], user: UserDBData | undefined): string =>
		user?.display_name || user?.username || player.name || `Player ${player.team + 1}`
</script>

<div class="flex flex-col gap-1" data-testid="player-list">
	{#each players as player (player.team)}
		{@const active = player.team === state.currentTeam && state.phase === 'playing'}
		<div
			class="relative flex items-center gap-2 overflow-hidden rounded-md pl-2.5 pr-2 py-1.5 text-xs transition-colors {active
				? 'bg-white/10'
				: 'bg-white/[0.03]'} {player.hasLost ? 'opacity-45' : ''}"
			data-testid="player-row"
			data-team={player.team}
		>
			<!-- Team-coloured edge: reads as "this side" even at a glance, and thickens
			     into the active marker on the side whose turn it is. -->
			<span
				class="absolute inset-y-0 left-0 transition-all {active ? 'w-1' : 'w-0.5 opacity-60'}"
				style="background:{teamColor(player.team)}"
			></span>

			{#if roster[player.team]}
				<span class="shrink-0">
					<UserIcon user={roster[player.team]} size={1.15} noClick />
				</span>
			{:else}
				<span
					class="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/40"
					style="background:{teamColor(player.team)}"
				></span>
			{/if}

			<span
				class="min-w-0 flex-1 truncate {player.hasLost ? 'line-through' : ''} {active
					? 'font-semibold text-white'
					: 'text-white/75'}"
			>
				{labelFor(player, roster[player.team])}
			</span>

			<span
				class="shrink-0 font-mono text-[11px] tabular-nums {active
					? 'text-emerald-300'
					: 'text-white/60'}"
				data-testid="player-money"
			>
				${player.money}
			</span>
		</div>
	{/each}
</div>
