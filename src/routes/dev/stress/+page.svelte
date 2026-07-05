<script lang="ts">
	import DevMatch from '$lib/Dev/DevMatch.svelte'
	import StressPerfHud from '$lib/Dev/StressPerfHud.svelte'
	import {
		buildStressMap,
		DEFAULT_STRESS,
		STRESS_PRESETS,
		type StressConfig,
		type StressStats,
	} from '$lib/Dev/stressMap'
	import { derivePlayersFromMap } from '$lib/Engine/gameState'
	import { tick } from 'svelte'

	// The editable config the sliders bind to. It is NOT applied live — a giant
	// map costs too much to rebuild on every drag — so edits stage here and only
	// take effect on "Rebuild" (or picking a preset).
	let config: StressConfig = { ...DEFAULT_STRESS }

	let map: MapObject | undefined
	let stats: StressStats | undefined
	let rebuildKey = 0
	let localTeam = -1 // default to spectate: CPU-vs-CPU churn is the real stress
	let fogOfWar = false
	let building = false
	let dirty = false

	const rebuild = async () => {
		building = true
		// Let the "building…" state paint before we block the main thread on a
		// potentially multi-hundred-ms synchronous build.
		await tick()
		await new Promise((r) => setTimeout(r, 16))
		const result = buildStressMap(config)
		map = result.map
		stats = result.stats
		rebuildKey += 1
		dirty = false
		building = false
	}

	const applyPreset = (next: StressConfig) => {
		config = { ...next }
		rebuild()
	}

	// Build the baseline preset once on mount.
	applyPreset(STRESS_PRESETS[0].config)

	$: teams = map ? derivePlayersFromMap(map).map((p) => p.team) : []

	// Slider definitions: [key, label, min, max, step].
	const sliders: [keyof StressConfig, string, number, number, number][] = [
		['cols', 'Width (cols)', 8, 300, 1],
		['rows', 'Height (rows)', 8, 300, 1],
		['teams', 'Teams', 1, 4, 1],
		['unitsPerTeam', 'Units / team', 0, 600, 1],
		['buildings', 'Buildings', 0, 400, 1],
	]

	const markDirty = () => (dirty = true)
</script>

<svelte:head><title>ThunderLite — Stress Test</title></svelte:head>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100">
	<header class="mb-3 space-y-1">
		<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
		<h1 class="text-2xl font-bold">Stress Test</h1>
		<p class="max-w-3xl text-sm text-slate-400">
			Generate oversized procedural maps and armies and run them through the real match stack — the
			same renderer, fog, threat overlay and CPU the game uses. Watch the live FPS / worst-frame
			meter to find where things start to lag. Spectate (CPU plays every team) is the default: a
			board churning through moves and combat is the honest load, not a settled one.
		</p>
	</header>

	<div class="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
		{#each STRESS_PRESETS as p}
			<button
				class="rounded bg-slate-800 px-2.5 py-1 hover:bg-slate-700"
				title={p.blurb}
				on:click={() => applyPreset(p.config)}
			>
				{p.name}
			</button>
		{/each}
	</div>

	<div class="mb-3 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm">
		{#each sliders as [key, label, min, max, step]}
			<label class="flex flex-col gap-1">
				<span class="flex justify-between gap-3 text-slate-400">
					<span>{label}</span>
					<span class="font-mono tabular-nums text-slate-200">{config[key]}</span>
				</span>
				<input
					type="range"
					{min}
					{max}
					{step}
					bind:value={config[key]}
					on:input={markDirty}
					class="w-40 accent-yellow-500"
				/>
			</label>
		{/each}

		<label class="flex flex-col gap-1">
			<span class="flex justify-between gap-3 text-slate-400">
				<span>Terrain variety</span>
				<span class="font-mono tabular-nums text-slate-200">{config.terrainVariety.toFixed(2)}</span>
			</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.05"
				bind:value={config.terrainVariety}
				on:input={markDirty}
				class="w-40 accent-yellow-500"
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-slate-400">Seed</span>
			<input
				type="number"
				bind:value={config.seed}
				on:input={markDirty}
				class="w-20 rounded bg-slate-700 px-2 py-1 font-mono"
			/>
		</label>

		<button
			class="rounded px-3 py-1.5 font-semibold {dirty
				? 'bg-yellow-500 text-slate-900 hover:bg-yellow-400'
				: 'bg-slate-700 hover:bg-slate-600'}"
			disabled={building}
			on:click={rebuild}
		>
			{building ? 'Building…' : dirty ? 'Rebuild ●' : 'Rebuild'}
		</button>
	</div>

	<div class="mb-3 flex flex-wrap items-center gap-4 text-sm">
		<label class="flex items-center gap-2 text-slate-400">
			Control
			<select bind:value={localTeam} class="rounded bg-slate-700 px-2 py-1">
				<option value={-1}>Spectate (CPU plays all)</option>
				{#each teams as t}<option value={t}>Play team {t}</option>{/each}
			</select>
		</label>
		<label class="flex items-center gap-2 text-slate-400">
			<input type="checkbox" bind:checked={fogOfWar} class="accent-yellow-500" />
			Fog of war
			<span class="text-xs text-slate-600">(adds per-turn visibility recompute over every unit)</span>
		</label>
	</div>

	<div class="relative h-[72vh] overflow-hidden rounded-lg border border-slate-700">
		{#if map}
			<DevMatch {map} {localTeam} {fogOfWar} {rebuildKey} menuHref="/dev/stress" />
		{/if}
		{#if building}
			<div class="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 text-lg text-slate-200">
				Building {config.cols}×{config.rows}…
			</div>
		{/if}
		{#if stats}
			<div class="absolute right-3 top-3 z-10 w-56">
				<StressPerfHud {stats} />
			</div>
		{/if}
	</div>
</main>
