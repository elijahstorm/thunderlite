<script lang="ts">
	import GameBoard from '$lib/Map/GameBoard.svelte'
	import { initGameStateFromMap } from '$lib/Engine/gameState'
	import { createCampaignInterface } from '$lib/Campaign/campaignInterface'
	import { repaintSignal, clearAnimations } from '$lib/Engine/Animator/animator'
	import { fogOfWarEnabled } from '$lib/Engine/fogState'
	import {
		buildSpawnTelegraphMap,
		planTelegraphs,
		tileAt,
		SPAWN_PLAN,
		FLOOD_PLAN,
	} from '$lib/Dev/spawnTelegraphScene'

	// A deterministic sandbox for the scripted-spawn resolution rules and the
	// one-turn-ahead telegraph. Deliberately NOT a live match: there's no CPU and no
	// auto-advancing turns, so the board stays exactly as placed and every case
	// (empty / own-block / ambush / invalid-terrain / drown) fires only when its
	// button is pressed. The board renders through the real GameBoard → MapRender →
	// paint stack, and every event goes through the real campaignInterface, so what
	// you see here is what a campaign level does.

	type Perspective = 0 | 1 | -1
	let perspective: Perspective = 0
	let fog = false
	let showTelegraphs = true
	let rebuildNonce = 0
	let redraw = 0

	// Spectating (team -1) with fog on just blacks the board out — sight comes only
	// from owned units — so force fog off with no team selected.
	$: effectiveFog = perspective >= 0 && fog
	$: fogOfWarEnabled.set(effectiveFog)

	// Any control change rebuilds a fresh board so each run starts from a clean slate.
	// (Firing a case mutates the board in place; switch a control to reset it.)
	$: buildKey = `${perspective}|${effectiveFog}|${showTelegraphs}|${rebuildNonce}`
	let map: MapObject
	let iface: ReturnType<typeof createCampaignInterface>
	let fired = new Set<number>()
	let flooded = new Set<number>()
	let lastBuildKey = ''
	$: if (buildKey !== lastBuildKey) {
		lastBuildKey = buildKey
		rebuild()
	}

	const rebuild = () => {
		clearAnimations()
		map = buildSpawnTelegraphMap()
		if (showTelegraphs) map.scheduledSpawns = planTelegraphs()
		initGameStateFromMap(map)
		// localTeam drives who the ghost marker is drawn for; spectate falls back to 0
		// for the interface's own bookkeeping but renders no ghosts (paint gates on team).
		iface = createCampaignInterface({ map, localTeam: perspective < 0 ? 0 : perspective })
		fired = new Set()
		flooded = new Set()
		redraw++
	}

	const fireSpawn = (i: number) => {
		const s = SPAWN_PLAN[i]
		iface.spawn(s.team, s.unit, s.x, s.y)
		fired.add(i)
		fired = fired
		// Resolved now, so drop its telegraph ghost.
		if (map.scheduledSpawns) {
			map.scheduledSpawns = map.scheduledSpawns.filter(
				(t) => !(t.tile === tileAt(s.x, s.y) && t.team === s.team)
			)
		}
		repaintSignal.update((n) => n + 1)
		redraw++
	}

	const fireFlood = (i: number) => {
		const f = FLOOD_PLAN[i]
		iface.setTerrain('Sea', f.x, f.y)
		flooded.add(i)
		flooded = flooded
		repaintSignal.update((n) => n + 1)
		redraw++
	}

	const fireAllSpawns = () => SPAWN_PLAN.forEach((_, i) => !fired.has(i) && fireSpawn(i))
	const reset = () => (rebuildNonce += 1)

	$: team0Cases = SPAWN_PLAN.map((s, i) => ({ ...s, i })).filter((s) => s.team === 0)
	$: team1Cases = SPAWN_PLAN.map((s, i) => ({ ...s, i })).filter((s) => s.team === 1)
</script>

<svelte:head><title>Spawn Telegraph Playground</title></svelte:head>

<div class="flex h-screen w-screen overflow-hidden bg-slate-900 text-slate-100">
	<aside class="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-700 p-4 text-sm">
		<div>
			<a href="/dev" class="text-slate-400 hover:text-white">← Dev</a>
			<h1 class="mt-1 text-lg font-bold">Spawn Telegraph</h1>
			<p class="text-xs text-slate-400">
				Trigger each scripted-spawn outcome and watch the owner-only telegraph. No CPU, no auto
				turns — the board only changes when you press a button.
			</p>
		</div>

		<div class="space-y-2 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
			<div class="text-xs font-semibold uppercase tracking-wide text-slate-400">View</div>
			<div class="flex gap-1">
				{#each [{ v: 0, l: 'Team 0' }, { v: 1, l: 'Team 1' }, { v: -1, l: 'Spectate' }] as opt}
					<button
						class="flex-1 rounded px-2 py-1 text-xs {perspective === opt.v
							? 'bg-sky-600 text-white'
							: 'bg-slate-700 text-slate-300 hover:bg-slate-600'}"
						on:click={() => (perspective = opt.v as Perspective)}
					>
						{opt.l}
					</button>
				{/each}
			</div>
			<label class="flex items-center gap-2 text-slate-300">
				<input type="checkbox" bind:checked={showTelegraphs} />
				Show next-turn telegraphs
			</label>
			<label class="flex items-center gap-2 {perspective < 0 ? 'text-slate-500' : 'text-slate-300'}">
				<input type="checkbox" bind:checked={fog} disabled={perspective < 0} />
				Fog of war
			</label>
			<p class="text-[11px] leading-snug text-slate-500">
				The cyan ghost is drawn only for the team it belongs to — switch View to confirm the other
				side never sees it. Hover a ghost tile for the tooltip.
			</p>
		</div>

		<div class="space-y-2 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
			<div class="flex items-center justify-between">
				<span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Team 0 drops</span>
				<button class="rounded bg-slate-700 px-2 py-0.5 text-[11px] hover:bg-slate-600" on:click={fireAllSpawns}>
					Fire all
				</button>
			</div>
			{#each team0Cases as c}
				<button
					class="w-full rounded border border-slate-700 bg-slate-900/60 p-2 text-left disabled:opacity-40"
					disabled={fired.has(c.i)}
					on:click={() => fireSpawn(c.i)}
				>
					<div class="font-semibold text-slate-200">{c.label} {fired.has(c.i) ? '✓' : ''}</div>
					<div class="text-[11px] text-slate-400">{c.expect}</div>
				</button>
			{/each}
		</div>

		<div class="space-y-2 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
			<span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Team 1 drops</span>
			{#each team1Cases as c}
				<button
					class="w-full rounded border border-slate-700 bg-slate-900/60 p-2 text-left disabled:opacity-40"
					disabled={fired.has(c.i)}
					on:click={() => fireSpawn(c.i)}
				>
					<div class="font-semibold text-slate-200">{c.label} {fired.has(c.i) ? '✓' : ''}</div>
					<div class="text-[11px] text-slate-400">{c.expect}</div>
				</button>
			{/each}
		</div>

		<div class="space-y-2 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
			<span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Terrain floods</span>
			{#each FLOOD_PLAN as f, i}
				<button
					class="w-full rounded border border-slate-700 bg-slate-900/60 p-2 text-left disabled:opacity-40"
					disabled={flooded.has(i)}
					on:click={() => fireFlood(i)}
				>
					<div class="font-semibold text-slate-200">{f.label} {flooded.has(i) ? '✓' : ''}</div>
					<div class="text-[11px] text-slate-400">{f.expect}</div>
				</button>
			{/each}
		</div>

		<button class="rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600" on:click={reset}>
			Reset board
		</button>
	</aside>

	<main class="relative flex-1 overflow-hidden">
		{#key buildKey}
			<GameBoard
				{map}
				requestRedraw={redraw}
				fogOfWar={effectiveFog}
				localTeam={perspective}
				menuHref="/dev/spawn-telegraph"
			/>
		{/key}
	</main>
</div>
