<script lang="ts">
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import GameBoard from '$lib/Map/GameBoard.svelte'
	import { socketEndTurn, socketSelect } from '$lib/Components/Socket/socket'
	import { clearAnimations } from '$lib/Engine/Animator/animator'
	import { fogOfWarEnabled } from '$lib/Engine/fogState'
	import { gameState } from '$lib/Engine/gameState'
	import { isStealthUnit, hasRadarField } from '$lib/Engine/visibility'
	import { lurkingStealthCount, noteStealthSighting } from '$lib/Engine/cpuAi/stealthMemory'
	import { unitData } from '$lib/GameData/unit'
	import { huntScenes } from '$lib/Dev/huntScenes'
	import { devHudEnabled, toggleDevHud } from '$lib/Dev/devHud'
	import { dev } from '$app/environment'

	// Local-only match: 'ephemeral' makes GameSocket fall back to its LocalInteracter,
	// so the board plays entirely client-side. Every team that isn't `team` is CPU.
	const gameSession = 'ephemeral'

	// The CPU we're studying. Team 0 is the cloak side you (optionally) control.
	const CPU_TEAM = 1
	const PLAYER_TEAM = 0

	let sceneIndex = 0
	let team = PLAYER_TEAM
	let fog = false

	$: scene = huntScenes[sceneIndex]

	// When the scene changes, adopt its preferred fog default (each scene authors one).
	let lastSceneId = ''
	$: if (scene.id !== lastSceneId) {
		lastSceneId = scene.id
		fog = scene.fog
	}

	// Engine reads fog live; mirror it so the readout matches what the board renders.
	$: fogOfWarEnabled.set(fog)

	// MapRender caches fog visibility, so fold every setting into a key and rebuild a
	// fresh map + remount the board whenever it changes.
	$: key = `${scene.id}|${fog}|${team}`
	let map: MapObject
	let lastKey = ''
	$: if (key !== lastKey) {
		lastKey = key
		map = scene.build()
	}

	// Tear down animation overlays on any board-identity change.
	$: key, clearAnimations()

	// "Brief the CPU": tell team 1 a cloaked enemy is at each of your stealth units'
	// current tiles — exactly the intel a radar flush / sighting would have given it,
	// but on demand and regardless of fog. The hunt logic (build radar, probe, screen)
	// only fires once the CPU believes something is lurking, so this primes the demo.
	let briefed = 0
	const briefCpu = () => {
		if (!map) return
		let any = false
		for (let tile = 0; tile < map.layers.units.length; tile++) {
			const u = map.layers.units[tile]
			if (u && u.team === PLAYER_TEAM && isStealthUnit(u)) {
				noteStealthSighting(CPU_TEAM, PLAYER_TEAM, [tile])
				any = true
			}
		}
		if (any) briefed++
	}

	// Re-briefing makes no sense across a rebuild; reset the badge with the board.
	$: key, (briefed = 0)

	// ── Live CPU intel readout ──────────────────────────────────────────────────
	// Everything the AI's stealth logic consults, recomputed after every action
	// ($gameState bumps on markTileActed) and on a fog toggle.
	type Intel = {
		lurking: number
		remembered: number
		ownRadar: number
		focus: { x: number; y: number; heat: number } | null
		hot: { x: number; y: number; heat: number }[]
	}
	let intel: Intel = { lurking: 0, remembered: 0, ownRadar: 0, focus: null, hot: [] }
	$: {
		$gameState
		fog
		briefed
		const out: Intel = { lurking: 0, remembered: 0, ownRadar: 0, focus: null, hot: [] }
		if (map) {
			out.lurking = lurkingStealthCount(map, CPU_TEAM)
			const player = $gameState.players.find((p) => p.team === CPU_TEAM)
			out.remembered = player?.stealthMemory?.[PLAYER_TEAM] ?? 0
			for (const u of map.layers.units) {
				if (u && u.team === CPU_TEAM && hasRadarField(u)) out.ownRadar++
			}
			const heat = player?.stealthSuspicion ?? {}
			const entries = Object.entries(heat)
				.map(([k, v]) => ({ tile: Number(k), heat: v }))
				.sort((a, b) => b.heat - a.heat)
			out.hot = entries.slice(0, 5).map((e) => ({
				x: e.tile % map.cols,
				y: Math.floor(e.tile / map.cols),
				heat: e.heat,
			}))
			out.focus = out.hot[0] ?? null
			// Feed the CPU's hunch to the board so the dev HUD (Q) can paint it.
			map.debugHeat = heat
			map.debugFocus = entries.length > 0 ? entries[0].tile : undefined
		}
		intel = out
	}

	// Dev HUD toggle: "Q" overlays tile index + (x,y) and the CPU's suspicion heat /
	// best-guess on the board itself. Dev-only — the store stays false in production.
	const onKeydown = (e: KeyboardEvent) => {
		if (!dev) return
		const target = e.target as HTMLElement | null
		if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return
		if (e.key === 'q' || e.key === 'Q') toggleDevHud()
	}

	const teamDot = (t: number) => (t === 0 ? 'bg-red-400' : t === 1 ? 'bg-sky-400' : 'bg-slate-400')

	$: cpuUnits = map
		? map.layers.units
				.map((u, tile) => ({ u, tile }))
				.filter((e): e is { u: UnitObject; tile: number } => !!e.u && e.u.team === CPU_TEAM)
		: []
</script>

<svelte:head><title>ThunderLite — Stealth Hunt (AI)</title></svelte:head>

<svelte:window on:keydown={onKeydown} />

<div class="flex h-screen w-screen overflow-hidden bg-slate-900 text-slate-100">
	<!-- Control panel -->
	<aside class="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-700 p-4">
		<div>
			<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
			<h1 class="mt-1 text-lg font-bold">Stealth Hunt (AI)</h1>
			<p class="text-xs text-slate-400">
				Watch the CPU (blue) react to cloaked enemies it believes are lurking — building radar,
				probing toward its best guess, and screening its valuable units. Brief it, then end your turn
				or spectate.
			</p>
		</div>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Scene</h2>
			<div class="flex flex-col gap-1">
				{#each huntScenes as s, i}
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
			<button
				class="rounded bg-emerald-600 px-2 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
				on:click={briefCpu}
			>
				Brief the CPU {briefed > 0 ? `(×${briefed})` : ''}
			</button>
			<p class="text-xs leading-snug text-slate-500">
				Feeds team 1 a sighting at each of your stealth units' tiles (memory + a location hunch),
				then end your turn to watch it act on the intel.
			</p>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={fog} />
				Fog of war
			</label>
			<label class="flex items-center gap-2 text-sm">
				View as
				<select bind:value={team} class="rounded bg-slate-800 px-1 py-0.5">
					<option value={0}>team 0 (red — stealth side)</option>
					<option value={-1}>spectate (both CPU)</option>
				</select>
			</label>
			<p class="text-xs leading-snug text-slate-500">
				The viewed team is the one you control; spectate to let both sides run as CPU. Switching
				rebuilds the board (and clears the briefing).
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
				CPU intel (live)
			</h2>
			<div class="grid grid-cols-2 gap-1.5 text-xs">
				<div class="rounded bg-slate-800 p-2">
					<div class="text-slate-500">lurking</div>
					<div class="text-lg font-bold {intel.lurking > 0 ? 'text-amber-300' : 'text-slate-300'}">
						{intel.lurking}
					</div>
				</div>
				<div class="rounded bg-slate-800 p-2">
					<div class="text-slate-500">remembered</div>
					<div class="text-lg font-bold text-slate-300">{intel.remembered}</div>
				</div>
				<div class="rounded bg-slate-800 p-2">
					<div class="text-slate-500">own radar</div>
					<div class="text-lg font-bold {intel.ownRadar > 0 ? 'text-teal-300' : 'text-slate-300'}">
						{intel.ownRadar}
					</div>
				</div>
				<div class="rounded bg-slate-800 p-2">
					<div class="text-slate-500">best guess</div>
					<div class="text-sm font-bold text-slate-300">
						{intel.focus ? `(${intel.focus.x}, ${intel.focus.y})` : '—'}
					</div>
				</div>
			</div>
			{#if intel.hot.length > 0}
				<div class="mt-2">
					<div class="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
						suspicion heat (top tiles)
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
				<b>lurking</b>: remembered cloak units it can't currently see. <b>best guess</b>: hottest tile
				in its fuzzy location hunch — it steers probes/radar here. The hunch decays and spreads each
				CPU turn, so a stale guess widens then fades.
			</p>
			<div class="mt-2 flex items-center gap-2 text-xs">
				<kbd class="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono">Q</kbd>
				<span class="text-slate-400">
					board HUD (tile #, x,y, heat):
					<span class={$devHudEnabled ? 'text-emerald-400' : 'text-slate-500'}>
						{$devHudEnabled ? 'on' : 'off'}
					</span>
				</span>
			</div>
		</section>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
				CPU roster
			</h2>
			<div class="flex flex-col gap-0.5 text-xs">
				{#each cpuUnits as e (e.tile)}
					<div class="flex items-center gap-1.5">
						<span class="inline-block h-2 w-2 rounded-full {teamDot(CPU_TEAM)}"></span>
						<span>{unitData[e.u.type]?.name ?? `#${e.u.type}`}</span>
						{#if hasRadarField(e.u)}<span
								class="rounded bg-teal-500/20 px-1 text-[10px] text-teal-300">radar</span
							>{/if}
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
						menuHref="/dev/stealth-hunt"
					/>
				</GameStateManager>
			</GameSocket>
		{/key}
	</main>
</div>
