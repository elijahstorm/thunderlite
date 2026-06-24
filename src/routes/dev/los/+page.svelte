<script lang="ts">
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import GameBoard from '$lib/Map/GameBoard.svelte'
	import { socketEndTurn, socketSelect } from '$lib/Components/Socket/socket'
	import { occlusionMode, indirectShadowsEnabled } from '$lib/Engine/occlusionState'
	import type { OcclusionMode } from '$lib/Engine/lineOfSight'
	import { losScenes } from '$lib/Dev/losScenes'
	import { dev } from '$app/environment'
	import PathDebugPanel from '$lib/Engine/Interactor/Pathing/PathDebugPanel.svelte'

	// Local-only match: an 'ephemeral' session makes GameSocket fall back to its
	// LocalInteracter, so the board plays entirely client-side (mirrors campaign).
	const gameSession = 'ephemeral'

	let sceneIndex = 0
	let mode: OcclusionMode = 'viewer-relative'
	let shadows = true
	let fog = true
	let team = 0

	const modes: { value: OcclusionMode; label: string }[] = [
		{ value: 'off', label: 'Off (classic diamond)' },
		{ value: 'viewer-relative', label: 'Viewer-relative tiers' },
		{ value: 'raycast', label: 'Raycast (eye height)' },
	]

	$: scene = losScenes[sceneIndex]

	// Engine reads these stores live; set them before the board (re)mounts.
	$: occlusionMode.set(mode)
	$: indirectShadowsEnabled.set(shadows)

	// MapRender caches fog visibility, so a settings change wouldn't refresh the
	// board on its own. Fold every setting into a key and rebuild a fresh map +
	// remount the whole board whenever it changes — a clean recompute each time.
	$: key = `${scene.id}|${mode}|${shadows}|${fog}|${team}`
	let map: MapObject
	let lastKey = ''
	$: if (key !== lastKey) {
		lastKey = key
		map = scene.build()
	}
</script>

<svelte:head><title>LOS / Height Playground</title></svelte:head>

<div class="flex h-screen w-screen overflow-hidden bg-slate-900 text-slate-100">
	<!-- Control panel -->
	<aside class="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-700 p-4">
		<div>
			<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
			<h1 class="mt-1 text-lg font-bold">Line of Sight / Height</h1>
			<p class="text-xs text-slate-400">
				Toggle the occlusion model and rules, then play the scene. Any change rebuilds the board.
			</p>
		</div>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Scene</h2>
			<div class="flex flex-col gap-1">
				{#each losScenes as s, i}
					<button
						class="rounded px-2 py-1 text-left text-sm transition-colors {i === sceneIndex
							? 'bg-yellow-500 font-semibold text-slate-900'
							: 'bg-slate-800 hover:bg-slate-700'}"
						on:click={() => (sceneIndex = i)}
					>
						{s.name}
					</button>
				{/each}
			</div>
			<p class="mt-2 text-xs leading-snug text-slate-400">{scene.blurb}</p>
		</section>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
				Occlusion model (#1)
			</h2>
			<div class="flex flex-col gap-1">
				{#each modes as m}
					<label class="flex items-center gap-2 text-sm">
						<input type="radio" bind:group={mode} value={m.value} />
						{m.label}
					</label>
				{/each}
			</div>
		</section>

		<section class="flex flex-col gap-2">
			<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Rules</h2>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={shadows} />
				Indirect-fire shadows (#4)
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={fog} />
				Fog of war
			</label>
			<label class="flex items-center gap-2 text-sm">
				Viewer team
				<select bind:value={team} class="rounded bg-slate-800 px-1 py-0.5">
					<option value={0}>0 (you)</option>
					<option value={1}>1</option>
				</select>
			</label>
		</section>

		<section class="mt-auto text-xs text-slate-400">
			<h2 class="mb-1 font-semibold uppercase tracking-wide">Legend</h2>
			<ul class="flex flex-col gap-1">
				<li><span class="inline-block h-3 w-3 rounded-sm bg-green-500/40"></span> move range</li>
				<li><span class="inline-block h-3 w-3 rounded-sm bg-red-500/40"></span> attack range</li>
				<li>
					<span class="inline-block h-3 w-3 rounded-sm bg-slate-500/60"></span> firing shadow (blocked)
				</li>
				<li><span class="inline-block h-3 w-3 rounded-sm bg-black/50"></span> fogged</li>
			</ul>
			<p class="mt-2">Select a ranged unit (Rocket / Mortar Truck) to see its firing shadow.</p>
		</section>
	</aside>

	<!-- Board -->
	<main class="relative flex-1 overflow-hidden">
		{#key key}
			<GameSocket map={() => map} {gameSession} let:socket let:requestRedraw>
				<GameStateManager
					{map}
					{gameSession}
					localTeam={team}
					mode="hotseat"
					interactor={socket ? socketSelect(socket, () => map) : undefined}
					endTurnAction={socket ? socketEndTurn(socket, () => map) : undefined}
					let:select
				>
					<GameBoard {map} {requestRedraw} {select} fogOfWar={fog} localTeam={team} menuHref="/dev/los" />
				</GameStateManager>
			</GameSocket>
		{/key}
	</main>

	<!-- DEV TOOL — movement/pathfinding diagnostics. dev-only (stripped from prod). -->
	{#if dev}
		<PathDebugPanel />
	{/if}
</div>
