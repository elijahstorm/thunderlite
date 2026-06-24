<script lang="ts">
	import DevMatch from '$lib/Dev/DevMatch.svelte'
	import DevMatchInspector from '$lib/Dev/DevMatchInspector.svelte'
	import { devScenes } from '$lib/Dev/devScenes'
	import { derivePlayersFromMap } from '$lib/Engine/gameState'

	// Win-condition / multi-team scenes first.
	const RULE_SCENE_IDS = ['ffa', 'duel2', 'skirmish']
	const scenes = RULE_SCENE_IDS.map((id) => devScenes.find((s) => s.id === id)).filter(
		(s): s is NonNullable<typeof s> => !!s
	)

	let sceneIndex = 0
	$: scene = scenes[sceneIndex]

	let map: MapObject
	let rebuildKey = 0
	let localTeam = -1 // default to spectating the FFA play out
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

<svelte:head><title>ThunderLite — Match Rules</title></svelte:head>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100">
	<header class="mb-3 space-y-1">
		<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
		<h1 class="text-2xl font-bold">Match Rules</h1>
		<p class="max-w-3xl text-sm text-slate-400">
			Win conditions, multi-team / FFA turn rotation and unit + building death states, all driven by
			the live runtime. A team is eliminated when it has no units <em>and</em> no Command Center; the
			last survivor wins. Spectate the FFA and watch teams drop out in the inspector.
		</p>
	</header>

	<div class="mb-3 flex flex-wrap items-center gap-3 text-sm">
		<div class="flex gap-1.5">
			{#each scenes as s, i}
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
				<option value={-1}>Spectate (CPU plays all)</option>
				{#each teams as t}<option value={t}>Play team {t}</option>{/each}
			</select>
		</label>
		<button class="rounded bg-slate-700 px-3 py-1 hover:bg-slate-600" on:click={reset}>
			Restart match
		</button>
		<span class="text-xs text-slate-500">{scene.blurb}</span>
	</div>

	<div class="flex flex-wrap gap-4">
		<div class="relative h-[70vh] min-w-[420px] flex-1 overflow-hidden rounded-lg border border-slate-700">
			{#if map}
				<DevMatch {map} {localTeam} {rebuildKey} fogOfWar={false} menuHref="/dev/rules" />
			{/if}
		</div>
		{#if map}
			<DevMatchInspector {map} />
		{/if}
	</div>
</main>
