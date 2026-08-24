<script lang="ts">
	import type { UserStats } from '$lib/Database/getUserStats'
	import type { EloHistory } from '$lib/Database/getEloHistory'
	import EloChart from './EloChart.svelte'

	interface Props {
		stats: UserStats
		heading?: string
		/**
		 * The ladder curve behind `stats.elo`. Optional: surfaces that only need
		 * the summary (and don't want the extra query) can leave it out and the
		 * panel renders exactly as it did before.
		 */
		history?: EloHistory | null
	}

	let { stats, heading = 'Match record', history = null }: Props = $props()

	let games = $derived(stats?.games ?? 0)
	let wins = $derived(stats?.wins ?? 0)
	let winRate = $derived(stats?.winRate ?? 0)
	let elo = $derived(stats?.elo ?? null)
	let ratedGames = $derived(history?.rated ?? 0)
	let showChart = $derived(!!history && history.points.length > 0)
</script>

<div class="card p-6 sm:p-8" data-testid="stats-panel">
	<header class="mb-4 flex flex-wrap items-start justify-between gap-3">
		<div>
			<p class="section-eyebrow">{heading}</p>
			<h2
				class="mt-1 text-xl font-semibold tracking-tight text-foreground"
				data-testid="stats-summary"
			>
				{games}
				{games === 1 ? 'game' : 'games'}, {wins}
				{wins === 1 ? 'win' : 'wins'}, {winRate}% win-rate
			</h2>
		</div>
		<div class="text-right" data-testid="stat-elo" title="Ranked rating from online 1v1 games">
			<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rating</p>
			<p class="text-3xl font-semibold tabular-nums leading-tight text-foreground">
				{elo ?? 'Unrated'}
			</p>
			<p class="text-xs text-muted-foreground">
				{#if elo == null}
					Play a ranked 1v1
				{:else if history?.peak != null && history.peak > elo}
					Peak {history.peak}
				{:else if ratedGames > 0}
					{ratedGames} rated {ratedGames === 1 ? 'match' : 'matches'}
				{:else}
					Ranked 1v1
				{/if}
			</p>
		</div>
	</header>

	{#if showChart && history}
		<div class="mb-5 border-y border-border py-4">
			<EloChart {history} />
		</div>
	{/if}

	<dl class="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
		<div>
			<dt class="text-muted-foreground">Games</dt>
			<dd class="text-lg font-semibold text-foreground" data-testid="stat-games">{games}</dd>
		</div>
		<div>
			<dt class="text-muted-foreground">Wins</dt>
			<dd class="text-lg font-semibold text-foreground" data-testid="stat-wins">{wins}</dd>
		</div>
		<div>
			<dt class="text-muted-foreground">Losses</dt>
			<dd class="text-lg font-semibold text-foreground" data-testid="stat-losses">
				{stats?.losses ?? 0}
			</dd>
		</div>
		<div>
			<dt class="text-muted-foreground">Win rate</dt>
			<dd class="text-lg font-semibold text-foreground" data-testid="stat-winrate">{winRate}%</dd>
		</div>
		<div>
			<dt class="text-muted-foreground">Level</dt>
			<dd class="text-lg font-semibold text-foreground">{stats?.level ?? 1}</dd>
		</div>
		<div>
			<dt class="text-muted-foreground">Points</dt>
			<dd class="text-lg font-semibold text-foreground">{stats?.points ?? 0}</dd>
		</div>
	</dl>
</div>
