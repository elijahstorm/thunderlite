<script lang="ts">
	import { onMount } from 'svelte'
	import { gameState, NEUTRAL_TEAM } from '$lib/Engine/gameState'
	import { evaluateWinConditions } from '$lib/Engine/winConditions'
	import { buildingData } from '$lib/GameData/building'
	import { unitData } from '$lib/GameData/unit'
	import { captureMaxStature } from '$lib/Engine/modifiers/capture'

	export let map: MapObject

	// The engine mutates `map.layers` in place without notifying Svelte, so poll on
	// a light interval to keep the map-derived panels live mid-turn. `gameState`
	// updates reactively on its own (turn flips, money, hasLost).
	let tick = 0
	onMount(() => {
		const id = setInterval(() => (tick += 1), 400)
		return () => clearInterval(id)
	})

	// Mirrors the in-game colorizer palette: 0 red, 1 blue, 2 green, 3 yellow, 4 grey (neutral).
	const TEAM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#94a3b8']
	const teamColor = (t: number) => TEAM_COLORS[t] ?? '#94a3b8'

	type TeamStat = {
		team: number
		units: number
		buildings: number
		income: number
		hp: number
	}

	const computeTeamStats = (m: MapObject): Map<number, TeamStat> => {
		const stats = new Map<number, TeamStat>()
		const ensure = (t: number) => {
			if (!stats.has(t)) stats.set(t, { team: t, units: 0, buildings: 0, income: 0, hp: 0 })
			return stats.get(t)!
		}
		for (const u of m.layers.units) {
			if (!u) continue
			const s = ensure(u.team)
			s.units += 1
			s.hp += u.health ?? unitData[u.type]?.health ?? 0
		}
		for (const b of m.layers.buildings) {
			if (!b || b.team === NEUTRAL_TEAM) continue
			const s = ensure(b.team)
			s.buildings += 1
			s.income += buildingData[b.type]?.income ?? 0
		}
		return stats
	}

	type CaptureInfo = {
		tile: number
		name: string
		team: number
		stature: number
		max: number
	}
	const captureState = (m: MapObject): CaptureInfo[] => {
		const out: CaptureInfo[] = []
		m.layers.buildings.forEach((b, tile) => {
			if (!b) return
			const max = captureMaxStature(b.type)
			out.push({
				tile,
				name: buildingData[b.type]?.name ?? '?',
				team: b.team,
				stature: typeof b.stature === 'number' ? b.stature : max,
				max,
			})
		})
		return out
	}

	// Recompute on every interval tick (map mutates in place) and on gameState changes.
	let teamStats = new Map<number, TeamStat>()
	let captures: CaptureInfo[] = []
	let win = { gameOver: false, losers: [] as number[] } as ReturnType<typeof evaluateWinConditions>
	$: {
		void tick
		teamStats = computeTeamStats(map)
		captures = captureState(map)
		win = evaluateWinConditions($gameState, map)
	}
	$: players = $gameState.players
</script>

<div class="w-80 space-y-4 text-sm">
	<!-- Match state -->
	<section class="rounded-lg border border-slate-700 bg-slate-800 p-3">
		<div class="flex items-center justify-between">
			<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Match</h2>
			<span class="text-xs text-slate-400">turn {$gameState.turnNumber ?? 0}</span>
		</div>
		<div class="mt-1 flex items-center gap-2">
			<span
				class="inline-block h-3 w-3 rounded-full"
				style="background:{teamColor($gameState.currentTeam)}"
			></span>
			<span>Team {$gameState.currentTeam}'s turn</span>
			<span class="ml-auto text-xs uppercase {win.gameOver ? 'text-emerald-400' : 'text-slate-500'}">
				{$gameState.phase}
			</span>
		</div>
		{#if win.gameOver}
			<p class="mt-2 rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
				{win.winner != null ? `Team ${win.winner} wins` : 'Draw'} · losers {win.losers.join(', ') ||
					'—'}
			</p>
		{/if}
	</section>

	<!-- Players / economy -->
	<section class="rounded-lg border border-slate-700 bg-slate-800 p-3">
		<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Players</h2>
		<div class="space-y-2">
			{#each players as p}
				{@const st = teamStats.get(p.team)}
				<div
					class="rounded border-l-4 bg-slate-900/50 px-2 py-1.5 {p.hasLost ? 'opacity-50' : ''}"
					style="border-color:{teamColor(p.team)}"
				>
					<div class="flex items-center justify-between">
						<span class="font-medium">Team {p.team}{p.hasLost ? ' (out)' : ''}</span>
						<span class="tabular-nums text-emerald-300">${p.money}</span>
					</div>
					<div class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
						<span>{st?.units ?? 0} units ({st?.hp ?? 0} hp)</span>
						<span>{st?.buildings ?? 0} bldgs</span>
						<span>+${st?.income ?? 0}/turn</span>
					</div>
					{#if p.controls}
						<div class="mt-0.5 text-[10px] text-slate-500">
							builds: {[
								p.controls.ground && 'ground',
								p.controls.air && 'air',
								p.controls.sea && 'sea',
							]
								.filter(Boolean)
								.join(', ') || 'none'}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<!-- Capture progress -->
	<section class="rounded-lg border border-slate-700 bg-slate-800 p-3">
		<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
			Buildings / capture
		</h2>
		<div class="space-y-1.5">
			{#each captures as c}
				<div class="text-[11px]">
					<div class="flex items-center justify-between">
						<span class="flex items-center gap-1.5">
							<span class="inline-block h-2.5 w-2.5 rounded-sm" style="background:{teamColor(c.team)}"
							></span>
							{c.name}
						</span>
						<span class="tabular-nums text-slate-400">{c.stature}/{c.max}</span>
					</div>
					{#if c.stature < c.max}
						<div class="mt-0.5 h-1 overflow-hidden rounded bg-slate-700">
							<div
								class="h-full bg-amber-400"
								style="width:{100 - (c.stature / c.max) * 100}%"
							></div>
						</div>
					{/if}
				</div>
			{/each}
			{#if captures.length === 0}
				<p class="text-[11px] text-slate-500">No buildings on this map.</p>
			{/if}
		</div>
	</section>
</div>
