<script lang="ts">
	import ScoreTimeline from '$lib/Engine/HUD/ScoreTimeline.svelte'
	import type { TeamSample, TimelinePoint } from '$lib/Engine/matchTimeline'

	/**
	 * Synthetic match shapes for the results chart, so its lines, fills, tooltip
	 * and insight tiles can be checked without playing a match to the end. Each
	 * scenario is a per-turn army table; funds and properties are derived so every
	 * metric has something to show.
	 */

	type Scenario = {
		id: string
		title: string
		teams: number[]
		winner: number | null
		/** Army value per team at each handover, starting from the untouched board. */
		armies: number[][]
	}

	const scenarios: Scenario[] = [
		{
			id: 'comeback',
			title: 'Comeback',
			teams: [0, 1],
			winner: 0,
			armies: [
				[1200, 1200],
				[1200, 1450],
				[1500, 1450],
				[1500, 2100],
				[1700, 2100],
				[1700, 2600],
				[2400, 2600],
				[2400, 2300],
				[3100, 2300],
				[3100, 1900],
				[3600, 1900],
				[3600, 1200],
				[4200, 1200],
				[4200, 300],
				[4300, 0],
			],
		},
		{
			id: 'wire',
			title: 'Wire to wire',
			teams: [0, 1],
			winner: 1,
			armies: [
				[900, 900],
				[900, 1300],
				[1000, 1300],
				[1000, 1900],
				[1300, 1900],
				[1300, 2500],
				[1100, 2500],
				[1100, 3200],
				[600, 3200],
				[600, 3900],
				[0, 4100],
			],
		},
		{
			id: 'ffa',
			title: 'Three sides',
			teams: [0, 1, 2],
			winner: 2,
			armies: [
				[800, 800, 800],
				[800, 800, 800],
				[800, 1100, 800],
				[800, 1100, 1100],
				[1200, 1100, 1100],
				[1200, 1400, 1100],
				[1200, 1400, 1500],
				[900, 1400, 1500],
				[900, 1000, 1500],
				[900, 1000, 2100],
				[400, 1000, 2100],
				[400, 600, 2100],
				[400, 600, 2800],
				[0, 600, 2800],
				[0, 200, 3000],
				[0, 0, 3100],
			],
		},
		{
			id: 'draw',
			title: 'Draw',
			teams: [0, 1],
			winner: null,
			armies: [
				[1000, 1000],
				[1000, 1000],
				[1100, 1000],
				[1100, 1100],
				[900, 1100],
				[900, 900],
			],
		},
		{
			id: 'long',
			title: 'Forty rounds',
			teams: [0, 1],
			winner: 0,
			armies: Array.from({ length: 81 }, (_, i) => {
				const t = i / 80
				const wave = Math.sin(t * Math.PI * 3) * 900
				return [Math.round(1500 + t * 3200 + wave), Math.round(1500 + t * 2400 - wave)]
			}),
		},
	]

	const build = (s: Scenario): TimelinePoint[] => {
		const seats = s.teams.length
		return s.armies.map((row, i) => {
			const teams: Record<number, TeamSample> = {}
			s.teams.forEach((team, seat) => {
				const army = row[seat]
				teams[team] = {
					army,
					funds: army === 0 ? 0 : 300 + ((i * 137 + seat * 59) % 900),
					properties: army === 0 ? 0 : 3 + Math.floor(army / 900),
					units: army === 0 ? 0 : Math.max(1, Math.floor(army / 350)),
				}
			})
			const turn = 1 + Math.floor(i / seats)
			const final = i === s.armies.length - 1
			return {
				x: turn + (i % seats) / seats,
				turn,
				afterTeam: i === 0 ? null : s.teams[(i - 1) % seats],
				final,
				teams,
			}
		})
	}

	const names = ['Red', 'Blue', 'Green', 'Yellow']
	const labelFor = (team: number) => names[team] ?? `Player ${team + 1}`

	let dark = $state(false)
	let localTeam = $state(0)
</script>

<svelte:head>
	<title>ThunderLite — Results Chart</title>
</svelte:head>

<main class="min-h-screen p-6 {dark ? 'dark bg-slate-950' : 'bg-slate-100'}">
	<header class="mx-auto flex max-w-3xl items-center justify-between gap-4">
		<div>
			<a href="/dev" class="text-xs text-primary hover:underline">&larr; Dev</a>
			<h1 class="text-xl font-bold text-foreground">Results chart</h1>
		</div>
		<div class="flex items-center gap-3 text-xs text-foreground">
			<label class="flex items-center gap-1.5">
				You are
				<select class="rounded border border-border bg-card px-1.5 py-0.5" bind:value={localTeam}>
					{#each names as name, team (team)}
						<option value={team}>{name}</option>
					{/each}
				</select>
			</label>
			<label class="flex items-center gap-1.5">
				<input type="checkbox" bind:checked={dark} />
				Dark
			</label>
		</div>
	</header>

	<div class="mx-auto mt-6 flex max-w-3xl flex-col gap-6">
		{#each scenarios as s (s.id)}
			<section
				class="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow"
				data-scenario={s.id}
			>
				<div class="border-b border-border px-6 py-3">
					<p class="section-eyebrow">{s.title}</p>
				</div>
				<div class="px-6 py-5">
					<ScoreTimeline
						points={build(s)}
						teams={s.teams}
						{labelFor}
						{localTeam}
						winner={s.winner}
					/>
				</div>
			</section>
		{/each}
	</div>
</main>
