<script lang="ts">
	import DevMatch from '$lib/Dev/DevMatch.svelte'
	import DevMatchInspector from '$lib/Dev/DevMatchInspector.svelte'
	import { devScenes } from '$lib/Dev/devScenes'
	import { derivePlayersFromMap } from '$lib/Engine/gameState'

	let sceneIndex = devScenes.findIndex((s) => s.id === 'economy')
	if (sceneIndex < 0) sceneIndex = 0
	$: scene = devScenes[sceneIndex]

	let map: MapObject
	let rebuildKey = 0
	let localTeam = 0
	let lastSceneId = ''
	$: if (scene.id !== lastSceneId) {
		lastSceneId = scene.id
		map = scene.build()
		rebuildKey += 1
	}

	$: teams = map ? derivePlayersFromMap(map).map((p) => p.team) : []

	const reset = () => {
		map = scene.build()
		rebuildKey += 1
	}
</script>

<svelte:head><title>ThunderLite — Economy & Capture</title></svelte:head>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100">
	<header class="mb-3 space-y-1">
		<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
		<h1 class="text-2xl font-bold">Economy &amp; Capture</h1>
		<p class="max-w-3xl text-sm text-slate-400">
			A real match — play a team or spectate while the CPU runs the rest. Income, capture progress
			(building <code class="text-slate-300">stature</code>) and ownership all tick live in the
			inspector. End your turn (or spectate) and watch the economy move.
		</p>
	</header>

	<div class="mb-3 flex flex-wrap items-center gap-3 text-sm">
		<div class="flex gap-1.5">
			{#each devScenes as s, i}
				<button
					class="rounded px-2.5 py-1 {i === sceneIndex
						? 'bg-yellow-500 font-semibold text-slate-900'
						: 'bg-slate-800 hover:bg-slate-700'}"
					on:click={() => (sceneIndex = i)}
				>
					{s.name}
				</button>
			{/each}
		</div>
		<label class="flex items-center gap-2 text-slate-400">
			Control
			<select bind:value={localTeam} class="rounded bg-slate-700 px-2 py-1">
				{#each teams as t}<option value={t}>Play team {t}</option>{/each}
				<option value={-1}>Spectate (CPU plays all)</option>
			</select>
		</label>
		<button class="rounded bg-slate-700 px-3 py-1 hover:bg-slate-600" on:click={reset}>
			Reset scene
		</button>
		<span class="text-xs text-slate-500">{scene.blurb}</span>
	</div>

	<div class="flex flex-wrap gap-4">
		<div class="relative h-[70vh] min-w-[420px] flex-1 overflow-hidden rounded-lg border border-slate-700">
			{#if map}
				<DevMatch {map} {localTeam} {rebuildKey} fogOfWar={false} menuHref="/dev/economy" />
			{/if}
		</div>
		{#if map}
			<DevMatchInspector {map} />
		{/if}
	</div>
</main>
