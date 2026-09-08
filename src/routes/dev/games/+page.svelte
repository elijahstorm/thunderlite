<script lang="ts">
	import AsyncGameCard, { type AsyncGameView } from '$lib/Components/Games/AsyncGameCard.svelte'

	/**
	 * The correspondence card in every state it can reach, side by side, without
	 * needing a seeded database: urgency tiers, an unrated opponent, a room still
	 * looking for a player, and a clock that already ran out.
	 *
	 * The board thumbnails render as "—" here on purpose: they fetch a real
	 * room's event log, and these sessions do not exist. Everything else — the
	 * layout, the urgency colours, the copy — is the production component.
	 */
	const HOUR = 60 * 60 * 1000
	const DAY = 24 * HOUR

	const player = (name: string, elo: number | null): UserDBData =>
		({
			auth: `auth-${name}`,
			username: name.toLowerCase(),
			display_name: name,
			elo,
		}) as unknown as UserDBData

	const base = {
		mapName: 'Ridgeline Standoff',
		started: true,
		turnTimeoutMs: 3 * DAY,
		filled: 2,
		capacity: 2,
		isHost: true,
		lastUpdated: Date.now() - 5 * HOUR,
		opponent: player('Ada', 1420),
	}

	const cases: { label: string; game: AsyncGameView }[] = [
		{
			label: 'Your move, plenty of clock',
			game: {
				...base,
				session: 'demo-calm',
				yourTurn: true,
				turnDeadline: Date.now() + 2 * DAY + 14 * HOUR,
			},
		},
		{
			label: 'Your move, under a day (amber)',
			game: {
				...base,
				session: 'demo-soon',
				yourTurn: true,
				turnDeadline: Date.now() + 19 * HOUR,
				mapName: 'Saltmarsh Crossing',
				opponent: player('Grace', null),
			},
		},
		{
			label: 'Your move, under six hours (destructive)',
			game: {
				...base,
				session: 'demo-critical',
				yourTurn: true,
				turnDeadline: Date.now() + 2 * HOUR + 20 * 60_000,
				mapName: 'Ironworks',
			},
		},
		{
			label: 'Your move, clock already gone',
			game: {
				...base,
				session: 'demo-expired',
				yourTurn: true,
				turnDeadline: Date.now() - 40 * 60_000,
			},
		},
		{
			label: 'Their move (quiet, no shouting)',
			game: {
				...base,
				session: 'demo-theirs',
				yourTurn: false,
				turnDeadline: Date.now() + 3 * HOUR,
				lastUpdated: Date.now() - 26 * HOUR,
				mapName: 'Tidewater Pass',
			},
		},
		{
			label: 'Looking for an opponent (invite state)',
			game: {
				...base,
				session: 'demo-filling',
				started: false,
				yourTurn: false,
				turnDeadline: null,
				filled: 1,
				lastUpdated: null,
				opponent: null,
				mapName: 'Ridgeline Standoff',
			},
		},
		{
			label: 'Four-side room, two seats short',
			game: {
				...base,
				session: 'demo-filling-4',
				started: false,
				yourTurn: false,
				turnDeadline: null,
				filled: 2,
				capacity: 4,
				lastUpdated: null,
				opponent: null,
				isHost: false,
				mapName: 'Quadrant Nine',
			},
		},
	]

	let now = $state(Date.now())
	setInterval(() => (now = Date.now()), 30_000)
</script>

<svelte:head>
	<title>ThunderLite — Async Games</title>
</svelte:head>

<main class="min-h-screen bg-background p-6">
	<header class="mx-auto max-w-3xl space-y-1">
		<h1 class="text-2xl font-bold text-foreground">Async game cards</h1>
		<p class="text-sm text-muted-foreground">
			Every state the games-hub card can reach. Board thumbnails read "—" because these rooms are
			synthetic; the layout, urgency colours and copy are the real component.
		</p>
	</header>

	<div class="mx-auto mt-8 max-w-3xl space-y-6">
		{#each cases as c (c.game.session)}
			<section class="space-y-2">
				<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{c.label}
				</p>
				<AsyncGameCard game={c.game} {now} onleave={() => {}} />
			</section>
		{/each}
	</div>
</main>
