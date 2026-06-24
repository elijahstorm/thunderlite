<script lang="ts">
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import GameBoard from '$lib/Map/GameBoard.svelte'
	import { socketEndTurn, socketSelect } from '$lib/Components/Socket/socket'
	import { clearAnimations } from '$lib/Engine/Animator/animator'
	import { fogOfWarEnabled } from '$lib/Engine/fogState'
	import { gameState } from '$lib/Engine/gameState'
	import { concealedEnemyTiles, isStealthUnit } from '$lib/Engine/visibility'
	import { unitData } from '$lib/GameData/unit'
	import { stealthScenes } from '$lib/Dev/stealthScenes'

	// Local-only match: an 'ephemeral' session makes GameSocket fall back to its
	// LocalInteracter, so the board plays entirely client-side. Every team that
	// isn't `team` is CPU-controlled — set `team` to -1 to spectate a full CPU run.
	const gameSession = 'ephemeral'

	let sceneIndex = 0
	let fog = true
	let team = 0

	$: scene = stealthScenes[sceneIndex]

	// Engine reads fog live; mirror it so the concealment readout below computes
	// against the same value the board renders with. (GameBoard also sets it.)
	$: fogOfWarEnabled.set(fog)

	// MapRender caches fog visibility, so a settings change wouldn't refresh the
	// board on its own. Fold every setting into a key and rebuild a fresh map +
	// remount the whole board whenever it changes.
	$: key = `${scene.id}|${fog}|${team}`
	let map: MapObject
	let lastKey = ''
	$: if (key !== lastKey) {
		lastKey = key
		map = scene.build()
	}

	// Tear animation overlays down on any board-identity change (they live in
	// module-global timer-driven stores and would otherwise leak onto the new board).
	$: key, clearAnimations()

	type Row = {
		tile: number
		name: string
		team: number
		stealth: boolean
		hidden: boolean
		concealedFromEnemy: boolean
	}

	// Live concealment readout. concealedEnemyTiles reads the fog store via get(),
	// so touch $gameState + fog inside the block as explicit deps: it recomputes
	// after every CPU action (markTileActed bumps gameState) and on a fog toggle.
	let rows: Row[] = []
	$: {
		$gameState
		fog
		rows = []
		if (map) {
			const concealed0 = concealedEnemyTiles(map, 0)
			const concealed1 = concealedEnemyTiles(map, 1)
			for (let tile = 0; tile < map.layers.units.length; tile++) {
				const unit = map.layers.units[tile]
				if (!unit) continue
				const enemyConceal = unit.team === 0 ? concealed1 : concealed0
				rows.push({
					tile,
					name: unitData[unit.type]?.name ?? `#${unit.type}`,
					team: unit.team,
					stealth: isStealthUnit(unit),
					hidden: unit.hidden === true,
					concealedFromEnemy: enemyConceal.has(tile),
				})
			}
			rows.sort((a, b) => a.team - b.team)
		}
	}

	const teamLabel = (t: number) => (t === 0 ? 'red' : t === 1 ? 'blue' : `t${t}`)
	const teamDot = (t: number) => (t === 0 ? 'bg-red-400' : t === 1 ? 'bg-sky-400' : 'bg-slate-400')
</script>

<svelte:head><title>ThunderLite — Stealth / Fog</title></svelte:head>

<div class="flex h-screen w-screen overflow-hidden bg-slate-900 text-slate-100">
	<!-- Control panel -->
	<aside class="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-700 p-4">
		<div>
			<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
			<h1 class="mt-1 text-lg font-bold">Stealth / Fog of War</h1>
			<p class="text-xs text-slate-400">
				Cloakable units (Stealth Tank, U-Boat) against the live CPU. Watch what each side can see —
				and how the AI reacts — in and out of fog. Any change rebuilds the board.
			</p>
		</div>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Scene</h2>
			<div class="flex flex-col gap-1">
				{#each stealthScenes as s, i}
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

		<section class="flex flex-col gap-2">
			<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Controls</h2>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={fog} />
				Fog of war
			</label>
			<label class="flex items-center gap-2 text-sm">
				View as
				<select bind:value={team} class="rounded bg-slate-800 px-1 py-0.5">
					<option value={0}>team 0 (red — stealth side)</option>
					<option value={1}>team 1 (blue — CPU side)</option>
					<option value={-1}>spectate (both CPU)</option>
				</select>
			</label>
			<p class="text-xs leading-snug text-slate-500">
				The team you view is the one you control; every other team is the CPU. Spectate to watch a
				full CPU-vs-CPU run. The board renders fog from the viewed team's vantage.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
				Concealment (live)
			</h2>
			<table class="w-full text-xs">
				<thead class="text-slate-500">
					<tr class="text-left">
						<th class="font-medium">unit</th>
						<th class="font-medium">flags</th>
						<th class="font-medium text-right">vs enemy</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.tile)}
						<tr class="border-t border-slate-800">
							<td class="py-1">
								<span class="inline-flex items-center gap-1.5">
									<span class="inline-block h-2 w-2 rounded-full {teamDot(r.team)}"></span>
									{r.name}
								</span>
							</td>
							<td class="py-1">
								{#if r.stealth}<span
										class="mr-1 rounded bg-violet-500/20 px-1 text-[10px] text-violet-300">stealth</span
									>{/if}
								{#if r.hidden}<span class="rounded bg-slate-600/40 px-1 text-[10px] text-slate-300"
										>hidden</span
									>{/if}
							</td>
							<td class="py-1 text-right">
								{#if r.concealedFromEnemy}
									<span class="text-emerald-400">unseen</span>
								{:else}
									<span class="text-rose-400">visible</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="mt-2 text-xs leading-snug text-slate-500">
				"vs enemy" = whether the opposing team currently perceives this unit (fog + stealth +
				cloak). This is exactly what movement pathing and the human attack list honor. NB: the CPU's
				attack list only filters by fog tiles, not the hidden flag — so a "hidden" unit on a tile the
				CPU can see is still a target for it.
			</p>
		</section>

		<section class="mt-auto text-xs text-slate-400">
			<h2 class="mb-1 font-semibold uppercase tracking-wide">Try this</h2>
			<p class="leading-snug">{scene.tip}</p>
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
					<GameBoard
						{map}
						{requestRedraw}
						{select}
						fogOfWar={fog}
						localTeam={team}
						menuHref="/dev/stealth"
					/>
				</GameStateManager>
			</GameSocket>
		{/key}
	</main>
</div>
