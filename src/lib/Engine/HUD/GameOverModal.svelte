<script lang="ts">
	import { gameState } from '../gameState'

	export let localTeam = 0

	$: state = $gameState
	$: isGameOver = state.phase === 'gameOver'
	$: localWon = typeof state.winner === 'number' && state.winner === localTeam
	$: title = localWon ? 'Victory' : 'Defeat'
</script>

{#if isGameOver}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
		data-testid="game-over-modal"
	>
		<div
			class="pointer-events-auto flex min-w-[280px] flex-col gap-3 rounded bg-black/90 p-5 text-white font-mono"
		>
			<h2 class="text-xl font-bold text-center" data-testid="game-over-title">
				{title}
			</h2>
			<div class="text-sm text-center" data-testid="game-over-winner">
				{#if typeof state.winner === 'number'}
					Winner: Player {state.winner + 1}
				{:else}
					No winner
				{/if}
			</div>
			<ul class="flex flex-col gap-1 text-sm" data-testid="game-over-players">
				{#each state.players as player (player.team)}
					<li class="flex items-center justify-between gap-3">
						<span>
							Player {player.team + 1}{player.name ? ` (${player.name})` : ''}
						</span>
						<span class="opacity-80">
							{player.hasLost ? 'eliminated' : 'survived'}
						</span>
					</li>
				{/each}
			</ul>
			<a
				href="/rooms"
				class="mt-2 self-center rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
				data-testid="game-over-back-to-rooms"
			>
				Back to Rooms
			</a>
		</div>
	</div>
{/if}
