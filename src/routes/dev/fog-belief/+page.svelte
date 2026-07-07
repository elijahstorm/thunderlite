<script lang="ts">
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import GameBoard from '$lib/Map/GameBoard.svelte'
	import { socketEndTurn, socketSelect } from '$lib/Components/Socket/socket'
	import { clearAnimations } from '$lib/Engine/Animator/animator'
	import { fogOfWarEnabled } from '$lib/Engine/fogState'
	import { gameState } from '$lib/Engine/gameState'
	import { updateFogBelief, strongestFogBelief, fogDebugLog } from '$lib/Engine/cpuAi/fogMemory'
	import { unitData } from '$lib/GameData/unit'
	import { fogScenes } from '$lib/Dev/fogScenes'
	import { devHudEnabled, toggleDevHud } from '$lib/Dev/devHud'
	import { dev } from '$app/environment'

	const gameSession = 'ephemeral'
	const CPU_TEAM = 1
	const PLAYER_TEAM = 0

	let sceneIndex = $state(0)
	let team = $state(PLAYER_TEAM)
	let fog = $state(true) // fog belief is meaningless without fog

	let scene = $derived(fogScenes[sceneIndex])

	$effect.pre(() => {
		fogOfWarEnabled.set(fog)
	})

	let key = $derived(`${scene.id}|${fog}|${team}`)
	const map = $derived.by(() => {
		void key // rebuild a fresh map on any settings change
		return scene.build()
	})

	$effect(() => {
		void key
		clearAnimations()
	})

	// Recompute the CPU's fog belief on demand — diffing the board against its last
	// snapshot — so you can manoeuvre your units and watch the hunch update without
	// having to end a turn. (The CPU also runs this itself at the start of its turn.)
	let scans = $state(0)
	const scanAsCpu = () => {
		if (!map) return
		updateFogBelief(map, CPU_TEAM)
		scans++
	}

	$effect(() => {
		void key
		scans = 0
	})

	type Intel = {
		believed: number
		focus: { x: number; y: number; heat: number } | null
		hot: { x: number; y: number; heat: number }[]
		seenEnemies: number
		ownUnits: number
		cleared: number
	}
	let intel: Intel = $state({
		believed: 0,
		focus: null,
		hot: [],
		seenEnemies: 0,
		ownUnits: 0,
		cleared: 0,
	})
	$effect(() => {
		void $gameState
		void fog
		void scans
		const out: Intel = {
			believed: 0,
			focus: null,
			hot: [],
			seenEnemies: 0,
			ownUnits: 0,
			cleared: 0,
		}
		if (map) {
			const player = $gameState.players.find((p) => p.team === CPU_TEAM)
			const heat = player?.fogBelief ?? {}
			const clearedMap = player?.fogCleared ?? {}
			const entries = Object.entries(heat)
				.map(([k, v]) => ({ tile: Number(k), heat: v }))
				.sort((a, b) => b.heat - a.heat)
			out.believed = entries.length
			out.hot = entries.slice(0, 5).map((e) => ({
				x: e.tile % map.cols,
				y: Math.floor(e.tile / map.cols),
				heat: e.heat,
			}))
			out.focus = out.hot[0] ?? null
			out.seenEnemies = player?.fogScan?.enemies.length ?? 0
			out.ownUnits = player?.fogScan?.own.length ?? 0
			out.cleared = Object.keys(clearedMap).length
			// Feed the belief (amber) and the ruled-out memory (teal) to the board so the
			// dev HUD (Q) can paint both layers.
			map.debugHeat = heat
			map.debugCleared = clearedMap
			const strongest = strongestFogBelief(CPU_TEAM)
			map.debugFocus = strongest ? strongest.tile : undefined
		}
		intel = out
	})

	const onKeydown = (e: KeyboardEvent) => {
		if (!dev) return
		const target = e.target as HTMLElement | null
		if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return
		if (e.key === 'q' || e.key === 'Q') toggleDevHud()
	}

	const teamDot = (t: number) => (t === 0 ? 'bg-red-400' : t === 1 ? 'bg-sky-400' : 'bg-slate-400')

	let cpuUnits = $derived(
		map
			? map.layers.units
					.map((u, tile) => ({ u, tile }))
					.filter((e): e is { u: UnitObject; tile: number } => !!e.u && e.u.team === CPU_TEAM)
			: []
	)
</script>

<svelte:head><title>ThunderLite — Fog Belief (AI)</title></svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="flex h-screen w-screen overflow-hidden bg-slate-900 text-slate-100">
	<!-- Control panel -->
	<aside class="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-700 p-4">
		<div>
			<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
			<h1 class="mt-1 text-lg font-bold">Fog Belief (AI)</h1>
			<p class="text-xs text-slate-400">
				Watch the CPU (blue) reason about what's hidden in the fog: it seeds a fuzzy hunch where a
				contact slips from its sight or a unit dies in the dark (amber), scouts toward the unknown —
				peeking into forests by standing right beside them — and remembers ground it swept clean
				(teal) so it doesn't re-tread it until that fades. Move your units in and out of its view,
				hide in the trees, and scan to watch it all update. Press <b>Q</b> for the board overlay.
			</p>
		</div>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Scene</h2>
			<div class="flex flex-col gap-1">
				{#each fogScenes as s, i}
					<button
						class="rounded px-2 py-1 text-left text-sm transition-colors {i === sceneIndex
							? 'bg-yellow-500 font-semibold text-slate-900'
							: 'bg-slate-800 hover:bg-slate-700'}"
						onclick={() => (sceneIndex = i)}
					>
						{s.name}
					</button>
				{/each}
			</div>
			<p class="mt-2 text-xs leading-snug text-slate-400">{scene.blurb}</p>
		</section>

		<section class="flex flex-col gap-2">
			<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Controls</h2>
			<button
				class="rounded bg-emerald-600 px-2 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
				onclick={scanAsCpu}
			>
				Scan as CPU {scans > 0 ? `(×${scans})` : ''}
			</button>
			<p class="text-xs leading-snug text-slate-500">
				Re-runs the CPU's turn-start fog scan against the current board. Scan once to take its
				baseline snapshot, move your units, then scan again to see the hunch update.
			</p>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={fog} />
				Fog of war
			</label>
			<label class="flex items-center gap-2 text-sm">
				View as
				<select bind:value={team} class="rounded bg-slate-800 px-1 py-0.5">
					<option value={0}>team 0 (red — you)</option>
					<option value={-1}>spectate (both CPU)</option>
				</select>
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={$fogDebugLog}
					onchange={() => fogDebugLog.update((v) => !v)}
				/>
				Debug log (console)
			</label>
			<p class="text-xs leading-snug text-slate-500">
				Dumps each scan and kill-seed to the browser console as JSON — open devtools to trace what
				the belief is reacting to.
			</p>
			<p class="text-xs leading-snug text-slate-500">
				Fog belief only exists with fog on. The board renders from your vantage; the hunch shown
				below is the CPU's, not yours.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
				CPU fog belief (live)
			</h2>
			<div class="grid grid-cols-2 gap-1.5 text-xs">
				<div class="rounded bg-slate-800 p-2">
					<div class="text-slate-500">believed tiles</div>
					<div class="text-lg font-bold {intel.believed > 0 ? 'text-amber-300' : 'text-slate-300'}">
						{intel.believed}
					</div>
				</div>
				<div class="rounded bg-slate-800 p-2">
					<div class="text-slate-500">best guess</div>
					<div class="text-sm font-bold text-slate-300">
						{intel.focus ? `(${intel.focus.x}, ${intel.focus.y})` : '—'}
					</div>
				</div>
				<div class="rounded bg-slate-800 p-2">
					<div class="text-slate-500">ruled out</div>
					<div class="text-lg font-bold {intel.cleared > 0 ? 'text-teal-300' : 'text-slate-300'}">
						{intel.cleared}
					</div>
				</div>
				<div class="rounded bg-slate-800 p-2">
					<div class="text-slate-500">enemies in sight</div>
					<div class="text-lg font-bold text-slate-300">{intel.seenEnemies}</div>
				</div>
				<div class="rounded bg-slate-800 p-2">
					<div class="text-slate-500">own units</div>
					<div class="text-lg font-bold text-slate-300">{intel.ownUnits}</div>
				</div>
			</div>
			{#if intel.hot.length > 0}
				<div class="mt-2">
					<div class="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
						belief heat (top tiles)
					</div>
					<div class="flex flex-col gap-0.5">
						{#each intel.hot as h}
							<div class="flex items-center gap-2 text-xs">
								<span class="w-12 tabular-nums text-slate-400">({h.x},{h.y})</span>
								<span class="h-2 flex-1 overflow-hidden rounded bg-slate-800">
									<span
										class="block h-full bg-amber-400"
										style="width: {Math.min(100, Math.round(h.heat * 100))}%"
									></span>
								</span>
								<span class="w-8 text-right tabular-nums text-slate-500">{h.heat.toFixed(2)}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
			<p class="mt-2 text-xs leading-snug text-slate-500">
				<b>enemies in sight</b> / <b>own units</b> are the CPU's last vision snapshot — the hunch is
				seeded by what changes between snapshots. <b class="text-teal-300">ruled out</b> is ground it
				recently peeked into and found empty (a Forest counts only when it stood right beside it); that
				confidence decays over ~5 scans, so a swept patch becomes worth re-checking again.
			</p>
			<div class="mt-2 flex items-center gap-3 text-[11px]">
				<span class="flex items-center gap-1">
					<span class="inline-block h-2.5 w-2.5 rounded-sm" style="background: rgba(251,191,36,0.7)"
					></span>
					<span class="text-slate-400">suspected</span>
				</span>
				<span class="flex items-center gap-1">
					<span class="inline-block h-2.5 w-2.5 rounded-sm" style="background: rgba(45,212,191,0.5)"
					></span>
					<span class="text-slate-400">ruled out</span>
				</span>
				<span class="flex items-center gap-1">
					<span class="inline-block h-2.5 w-2.5 rounded-sm border-2 border-red-500"></span>
					<span class="text-slate-400">best guess</span>
				</span>
			</div>
			<div class="mt-2 flex items-center gap-2 text-xs">
				<kbd class="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono">Q</kbd>
				<span class="text-slate-400">
					board HUD overlay:
					<span class={$devHudEnabled ? 'text-emerald-400' : 'text-slate-500'}>
						{$devHudEnabled ? 'on' : 'off'}
					</span>
				</span>
			</div>
		</section>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">CPU roster</h2>
			<div class="flex flex-col gap-0.5 text-xs">
				{#each cpuUnits as e (e.tile)}
					<div class="flex items-center gap-1.5">
						<span class="inline-block h-2 w-2 rounded-full {teamDot(CPU_TEAM)}"></span>
						<span>{unitData[e.u.type]?.name ?? `#${e.u.type}`}</span>
						<span class="text-slate-500">sight {unitData[e.u.type]?.sight ?? 0}</span>
					</div>
				{/each}
			</div>
		</section>

		<section class="mt-auto text-xs text-slate-400">
			<h2 class="mb-1 font-semibold uppercase tracking-wide">Try this</h2>
			<p class="leading-snug">{scene.tip}</p>
		</section>
	</aside>

	<!-- Board -->
	<main class="relative flex-1 overflow-hidden">
		{#key key}
			<GameSocket map={() => map} {gameSession}>
				{#snippet children({ socket, requestRedraw })}
					<GameStateManager
						{map}
						{gameSession}
						localTeam={team}
						mode="hotseat"
						interactor={socket ? socketSelect(socket, () => map) : undefined}
						endTurnAction={socket ? socketEndTurn(socket, () => map) : undefined}
					>
						{#snippet children({ select })}
							<GameBoard
								{map}
								{requestRedraw}
								{select}
								fogOfWar={fog}
								localTeam={team}
								menuHref="/dev/fog-belief"
							/>
						{/snippet}
					</GameStateManager>
				{/snippet}
			</GameSocket>
		{/key}
	</main>
</div>
