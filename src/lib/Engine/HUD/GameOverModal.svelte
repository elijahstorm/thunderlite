<script lang="ts">
	import { gameState } from '../gameState'
	import { playerRoster } from './playerRoster'
	import { matchRating } from '$lib/Game/matchRating'
	import RatingBadge from '$lib/Components/Profile/RatingBadge.svelte'

	interface Props {
		localTeam?: number
	}

	let { localTeam = 0 }: Props = $props()

	let state = $derived($gameState)
	let isGameOver = $derived(state.phase === 'gameOver')
	let localWon = $derived(typeof state.winner === 'number' && state.winner === localTeam)
	let title = $derived(localWon ? 'Victory' : 'Defeat')

	// Online matches carry each side's profile, so the result screen can name the
	// people who played instead of "Player 1" / "Player 2".
	let roster = $derived($playerRoster)
	const nameOf = (team: number): string => {
		const user = roster[team]
		const engineName = state.players.find((p) => p.team === team)?.name
		return user?.display_name || user?.username || engineName || `Player ${team + 1}`
	}

	// The ladder movement this match produced, posted back by recordMatch once the
	// server has settled it. Null for anything unrated, which is most matches.
	let rating = $derived($matchRating)
	let ratingAfter = $derived(rating ? rating.before + rating.delta : null)
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
					Winner: {nameOf(state.winner)}
				{:else}
					No winner
				{/if}
			</div>

			{#if rating && ratingAfter != null}
				<!-- The single number people care about after a ranked game, shown
				     where the game ends rather than three clicks away on /me. -->
				<div
					class="flex items-center justify-center gap-2 rounded bg-white/5 px-3 py-2 text-sm"
					data-testid="game-over-rating"
				>
					<span class="text-white/60">Rating</span>
					<span class="tabular-nums text-white/60">{rating.before}</span>
					<span aria-hidden="true" class="text-white/40">&rarr;</span>
					<RatingBadge elo={ratingAfter} delta={rating.delta} size="sm" onDark />
				</div>
			{/if}

			<ul class="flex flex-col gap-1 text-sm" data-testid="game-over-players">
				{#each state.players as player (player.team)}
					<li class="flex items-center justify-between gap-3">
						<span class="flex items-center gap-2">
							{nameOf(player.team)}
							{#if roster[player.team]}
								<RatingBadge elo={roster[player.team].elo} size="xs" bare onDark hideUnrated />
							{/if}
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
