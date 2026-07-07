<script lang="ts">
	import DevMatch from '$lib/Dev/DevMatch.svelte'
	import DevMatchInspector from '$lib/Dev/DevMatchInspector.svelte'
	import { devScenes, applyWeather, WEATHER_OPTIONS } from '$lib/Dev/devScenes'
	import { skyData } from '$lib/GameData/sky'
	import { derivePlayersFromMap } from '$lib/Engine/gameState'

	let sceneIndex = $state(
		Math.max(
			0,
			devScenes.findIndex((s) => s.id === 'airfield')
		)
	)
	let scene = $derived(devScenes[sceneIndex])

	let weatherIdx = $state(0) // index into WEATHER_OPTIONS
	let weather = $derived(WEATHER_OPTIONS[weatherIdx])

	let map = $state.raw<MapObject>()
	let rebuildKey = $state(0)
	let localTeam = $state(-1)
	let lastKey = $state('')
	// Weather is baked into the sky layer at build time, so it's part of the key —
	// changing it rebuilds the board the same way the LOS page does.
	let key = $derived(`${scene.id}|${weather.name}`)
	$effect.pre(() => {
		if (key !== lastKey) {
			lastKey = key
			map = applyWeather(scene.build(), weather.skyType)
			rebuildKey += 1
		}
	})

	let teams = $derived(map ? derivePlayersFromMap(map).map((p) => p.team) : [])
	let activeSky = $derived(weather.skyType != null ? skyData[weather.skyType] : null)

	const reset = () => {
		map = applyWeather(scene.build(), weather.skyType)
		rebuildKey += 1
	}
</script>

<svelte:head><title>ThunderLite — Weather</title></svelte:head>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100">
	<header class="mb-3 space-y-1">
		<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
		<h1 class="text-2xl font-bold">Weather</h1>
		<p class="max-w-3xl text-sm text-slate-400">
			Paint a sky layer over a real match. Weather is a genuine game system: storm deals per-turn
			damage to air units and clouds hide them from enemy sight. Spectate or play, end turns, and
			watch air HP move in the inspector.
		</p>
	</header>

	<div class="mb-3 flex flex-wrap items-center gap-3 text-sm">
		<div class="flex gap-1.5">
			{#each devScenes as s, i}
				<button
					class="rounded px-2.5 py-1 {i === sceneIndex
						? 'bg-yellow-500 font-semibold text-slate-900'
						: 'bg-slate-800 hover:bg-slate-700'}"
					onclick={() => (sceneIndex = i)}
				>
					{s.name}
				</button>
			{/each}
		</div>
		<label class="flex items-center gap-2 text-slate-400">
			Weather
			<select bind:value={weatherIdx} class="rounded bg-slate-700 px-2 py-1">
				{#each WEATHER_OPTIONS as w, i}<option value={i}>{w.name}</option>{/each}
			</select>
		</label>
		<label class="flex items-center gap-2 text-slate-400">
			Control
			<select bind:value={localTeam} class="rounded bg-slate-700 px-2 py-1">
				<option value={-1}>Spectate (CPU plays all)</option>
				{#each teams as t}<option value={t}>Play team {t}</option>{/each}
			</select>
		</label>
		<button class="rounded bg-slate-700 px-3 py-1 hover:bg-slate-600" onclick={reset}>
			Restart
		</button>
	</div>

	{#if activeSky}
		<p class="mb-2 text-xs text-slate-400">
			<span class="font-semibold text-slate-300">{activeSky.name}:</span>
			{activeSky.description}
		</p>
	{/if}

	<div class="flex flex-wrap gap-4">
		<div
			class="relative h-[70vh] min-w-[420px] flex-1 overflow-hidden rounded-lg border border-slate-700"
		>
			{#if map}
				<DevMatch {map} {localTeam} {rebuildKey} fogOfWar={false} menuHref="/dev/weather" />
			{/if}
		</div>
		{#if map}
			<DevMatchInspector {map} />
		{/if}
	</div>
</main>
