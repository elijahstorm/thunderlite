<script lang="ts">
	import DevMatch from '$lib/Dev/DevMatch.svelte'
	import { splashScenes } from '$lib/Dev/splashScenes'

	// Playground for area-of-effect attacks: splash (Scorcher / Breaker / Gunship),
	// lance passthrough, and forest burn. A real match through DevMatch, so selecting
	// your unit and hovering an enemy shows the live red AoE reticle, and committing
	// the shot fires the actual flame / shrapnel / pierce overlays, the lockstep
	// health-bar drains and friendly fire — everything a campaign level would.

	let sceneIndex = 0
	$: scene = splashScenes[sceneIndex]

	let map: MapObject
	let rebuildKey = 0
	let localTeam = 0
	let lastSceneId = ''
	$: if (scene.id !== lastSceneId) {
		lastSceneId = scene.id
		map = scene.build()
		rebuildKey += 1
	}

	const reset = () => {
		map = scene.build()
		rebuildKey += 1
	}

	const legend = [
		{ dot: 'bg-orange-500', label: 'Flame', note: 'Scorcher splash + burning forest' },
		{ dot: 'bg-slate-300', label: 'Shrapnel', note: 'Breaker / Gunship explosive splash' },
		{ dot: 'bg-sky-400', label: 'Pierce', note: 'Lance passthrough shock' },
	]
</script>

<svelte:head><title>ThunderLite — Splash / AoE Lab</title></svelte:head>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100">
	<header class="mb-3 space-y-1">
		<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
		<h1 class="text-2xl font-bold">Splash / AoE Lab</h1>
		<p class="max-w-3xl text-sm text-slate-400">
			Line up a secondary-hit attacker on a cluster, then <strong
				>select it and hover a target</strong
			>
			to see the red blast reticle before you commit. Click to fire and watch the flame / shrapnel / pierce
			effects, the lockstep bar drains, friendly fire, and the air-overfly type filter — all through the
			real combat stack.
		</p>
	</header>

	<div class="mb-3 flex flex-wrap items-center gap-3 text-sm">
		<div class="flex flex-wrap gap-1.5">
			{#each splashScenes as s, i}
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
				<option value={0}>Play team 0 (attacker)</option>
				<option value={1}>Play team 1</option>
				<option value={-1}>Spectate</option>
			</select>
		</label>
		<button class="rounded bg-slate-700 px-3 py-1 hover:bg-slate-600" on:click={reset}>
			Reset scene
		</button>
	</div>

	<div class="flex flex-wrap gap-4">
		<div
			class="relative h-[70vh] min-w-[420px] flex-1 overflow-hidden rounded-lg border border-slate-700"
		>
			{#if map}
				<DevMatch {map} {localTeam} {rebuildKey} fogOfWar={false} menuHref="/dev/splash" />
			{/if}
		</div>

		<aside class="w-80 shrink-0 space-y-4 text-sm">
			<div class="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
				<h2 class="mb-1 font-semibold">{scene.name}</h2>
				<p class="mb-3 text-xs text-slate-400">{scene.blurb}</p>
				<ol class="list-decimal space-y-2 pl-4 text-xs text-slate-300">
					{#each scene.tips as tip}
						<li>{tip}</li>
					{/each}
				</ol>
			</div>

			<div class="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
				<h2 class="mb-2 font-semibold">Effect legend</h2>
				<ul class="space-y-1.5 text-xs text-slate-300">
					{#each legend as l}
						<li class="flex items-center gap-2">
							<span class="inline-block h-3 w-3 rounded-full {l.dot}"></span>
							<span class="font-medium">{l.label}</span>
							<span class="text-slate-500">— {l.note}</span>
						</li>
					{/each}
				</ul>
				<p class="mt-3 text-[11px] leading-relaxed text-slate-500">
					The wash is team-blind: it hits your own units too, but only ever unit types the attacker
					could target directly (a ground flame passes under air units).
				</p>
			</div>
		</aside>
	</div>
</main>
