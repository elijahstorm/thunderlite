<script lang="ts">
	import type { UserStats } from '$lib/Database/getUserStats'

	export let stats: UserStats
	export let heading = 'Match record'

	$: games = stats?.games ?? 0
	$: wins = stats?.wins ?? 0
	$: winRate = stats?.winRate ?? 0
</script>

<div class="card p-6 sm:p-8" data-testid="stats-panel">
	<header class="mb-4">
		<p class="section-eyebrow">{heading}</p>
		<h2
			class="mt-1 text-xl font-semibold tracking-tight text-foreground"
			data-testid="stats-summary"
		>
			{games}
			{games === 1 ? 'game' : 'games'}, {wins}
			{wins === 1 ? 'win' : 'wins'}, {winRate}% win-rate
		</h2>
	</header>

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
