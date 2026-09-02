<script lang="ts">
	import { onMount, untrack } from 'svelte'
	import { get } from 'svelte/store'
	import DevMatch from '$lib/Dev/DevMatch.svelte'
	import ScoreTimeline from '$lib/Engine/HUD/ScoreTimeline.svelte'
	import { devScenes } from '$lib/Dev/devScenes'
	import { devHudEnabled } from '$lib/Dev/devHud'
	import { runBatch, type BatchSummary } from '$lib/Dev/aiBatch'
	import { gameState, derivePlayersFromMap } from '$lib/Engine/gameState'
	import { fogOfWarEnabled } from '$lib/Engine/fogState'
	import { matchTimeline, metricValue } from '$lib/Engine/matchTimeline'
	import { teamColor } from '$lib/Engine/teamColors'
	import { randomMatchSeed } from '$lib/Engine/matchSeed'
	import { generateMovementList } from '$lib/Engine/Interactor/Pathing/movement'
	import { scorePositionBonus } from '$lib/Engine/cpuAi/score'
	import { beginCpuPlanning, endCpuPlanning } from '$lib/Engine/cpuAi/planningContext'
	import type { CpuPolicy } from '$lib/Engine/cpuAi'
	import type { SearchConfig, SearchTelemetry } from '$lib/Engine/cpuAi/search'
	import {
		DEFAULT_WEIGHTS,
		WEIGHT_GROUPS,
		changedCpuWeights,
		resetCpuWeights,
		setCpuWeights,
		weights,
		type CpuWeightKey,
	} from '$lib/Engine/cpuAi/weights'
	import { unitData } from '$lib/GameData/unit'

	// ── Scene & seats ───────────────────────────────────────────────────────────
	type Seat = 'human' | 'greedy' | 'search'

	let sceneIndex = $state(
		Math.max(
			0,
			devScenes.findIndex((s) => s.id === 'skirmish')
		)
	)
	let scene = $derived(devScenes[sceneIndex])
	let fog = $state(false)
	let seedText = $state('')
	let seed = $derived.by(() => {
		const n = Number(seedText)
		return seedText.trim() !== '' && Number.isFinite(n) ? n >>> 0 : null
	})
	let seats = $state<Record<number, Seat>>({ 0: 'greedy', 1: 'search', 2: 'greedy', 3: 'greedy' })

	// Declared ahead of `rebuild`, which the scene effect below calls during init.
	let telemetry = $state<Record<number, SearchTelemetry>>({})
	/** What the search expected of the position after its turn, per CPU turn. */
	let predictions = $state<{ turn: number; team: number; value: number; greedy: number }[]>([])
	let selectedUnit = $state<number | null>(null)

	// The engine mutates the board in place; keep it out of deep reactivity.
	let map = $state.raw<MapObject | undefined>(undefined)
	let rebuildKey = $state(0)
	let teams = $derived(map ? derivePlayersFromMap(map).map((p) => p.team) : [])
	let localTeam = $derived.by(() => {
		const human = teams.find((t) => seats[t] === 'human')
		return human ?? -1
	})

	const rebuild = () => {
		map = scene.build()
		rebuildKey += 1
		telemetry = {}
		predictions = []
		selectedUnit = null
	}
	let lastSceneId = ''
	$effect.pre(() => {
		if (scene.id !== lastSceneId) {
			lastSceneId = scene.id
			untrack(rebuild)
		}
	})
	$effect.pre(() => {
		fogOfWarEnabled.set(fog)
	})
	onMount(() => () => fogOfWarEnabled.set(false))

	const cpuPolicyFor = (team: number): CpuPolicy => (seats[team] === 'search' ? 'search' : 'greedy')

	// ── Search knobs ────────────────────────────────────────────────────────────
	let maxDepth = $state(2)
	let budgetMs = $state(1000)
	let budgetNodes = $state('')
	let K = $state(3)
	let B = $state(8)
	let Bopp = $state(3)
	let contactRadius = $state(6)
	let fast = $state(false)
	let cpuSearch = $derived.by((): Partial<SearchConfig> => {
		const nodes = Number(budgetNodes)
		return {
			maxDepth,
			K,
			B,
			Bopp,
			contactRadius,
			budget:
				budgetNodes.trim() !== '' && Number.isFinite(nodes) && nodes > 0
					? { nodes }
					: { ms: budgetMs },
		}
	})

	// ── Telemetry & predictions ─────────────────────────────────────────────────
	const onCpuSearch = (team: number, t: SearchTelemetry) => {
		telemetry = { ...telemetry, [team]: t }
		if (t.chosenValue !== null && t.greedyValue !== null) {
			predictions = [
				...predictions,
				{ turn: get(gameState).turnNumber, team, value: t.chosenValue, greedy: t.greedyValue },
			]
		}
	}

	// ── Weights ─────────────────────────────────────────────────────────────────
	let w = $state<Record<string, number>>({ ...weights })
	let openGroups = $state<Record<string, boolean>>({})
	const setWeight = (key: CpuWeightKey, value: number) => {
		if (!Number.isFinite(value)) return
		w[key] = value
		setCpuWeights({ [key]: value })
	}
	const resetWeights = () => {
		resetCpuWeights()
		w = { ...weights }
	}
	let copied = $state(false)
	const copyWeights = async () => {
		const changed = changedCpuWeights()
		await navigator.clipboard?.writeText(JSON.stringify(changed, null, 2))
		copied = true
		setTimeout(() => (copied = false), 1200)
	}
	const step = (key: CpuWeightKey) => {
		const v = Math.abs(DEFAULT_WEIGHTS[key])
		if (v === 0) return 1
		const magnitude = Math.pow(10, Math.floor(Math.log10(v)))
		return magnitude / 10
	}
	const range = (key: CpuWeightKey): [number, number] => {
		const v = DEFAULT_WEIGHTS[key]
		if (v === 0) return [-10, 10]
		return v > 0 ? [0, v * 4] : [v * 4, 0]
	}
	let changedCount = $derived(
		Object.keys(w).filter((k) => w[k] !== DEFAULT_WEIGHTS[k as CpuWeightKey]).length
	)

	// ── Eval overlay ────────────────────────────────────────────────────────────
	// Paint the selected CPU unit's position score over its reachable tiles (the same
	// hook /dev/ai uses), normalised 0..1 for the dev HUD's amber tint. Q toggles the HUD.
	let cpuUnits = $derived.by(() => {
		void $gameState
		if (!map) return []
		return map.layers.units
			.map((u, tile) => ({ u, tile }))
			.filter((e): e is { u: UnitObject; tile: number } => !!e.u && seats[e.u.team] !== 'human')
	})
	$effect(() => {
		void $gameState
		if (!map) return
		if (selectedUnit === null || !map.layers.units[selectedUnit]) {
			map.debugHeat = undefined
			map.debugFocus = undefined
			return
		}
		const unit = map.layers.units[selectedUnit] as UnitObject
		beginCpuPlanning(map)
		try {
			const reach = generateMovementList(map, selectedUnit, unit)
			const scores = reach.map((t) => [t, scorePositionBonus(map!, t, unit, unit.team)] as const)
			const lo = Math.min(...scores.map(([, s]) => s))
			const hi = Math.max(...scores.map(([, s]) => s))
			const heat: Record<number, number> = {}
			let bestTile = selectedUnit
			let best = -Infinity
			for (const [t, s] of scores) {
				heat[t] = hi > lo ? 0.15 + (0.85 * (s - lo)) / (hi - lo) : 0.5
				if (s > best) {
					best = s
					bestTile = t
				}
			}
			map.debugHeat = heat
			map.debugFocus = bestTile
		} finally {
			endCpuPlanning()
		}
		devHudEnabled.set(true)
	})
	onMount(() => () => devHudEnabled.set(false))

	// ── Momentum chart ──────────────────────────────────────────────────────────
	const labelFor = (team: number) => `Team ${team} · ${seats[team] ?? 'cpu'}`
	let winner = $derived(
		$gameState.phase === 'gameOver' && typeof $gameState.winner === 'number'
			? $gameState.winner
			: null
	)
	// Eval vs actual: the search's expected value of the position after its turn,
	// against the strength gap the chart actually recorded at the next handover.
	let evalVsActual = $derived.by(() => {
		const points = $matchTimeline
		return predictions.map((p) => {
			const after = points.find((pt) => pt.turn >= p.turn && pt.afterTeam === p.team)
			const rivals = teams.filter((t) => t !== p.team)
			const actual = after
				? metricValue(after.teams[p.team], 'strength') -
					Math.max(0, ...rivals.map((r) => metricValue(after.teams[r], 'strength')))
				: null
			return { ...p, actual }
		})
	})

	// ── Batch ───────────────────────────────────────────────────────────────────
	let batchGames = $state(8)
	let batchRounds = $state(20)
	let batchA = $state<CpuPolicy>('search')
	let batchB = $state<CpuPolicy>('greedy')
	let batchNodes = $state(300)
	let batchAlternate = $state(true)
	let batchRunning = $state(false)
	let batchStop = false
	let batch = $state<BatchSummary | null>(null)
	const runTheBatch = async () => {
		if (batchRunning) return
		batchRunning = true
		batchStop = false
		batch = null
		const build = scene.build
		try {
			batch = await runBatch(
				{
					buildMap: build,
					games: batchGames,
					maxRounds: batchRounds,
					fog,
					seedBase: seed ?? randomMatchSeed(),
					alternateSeats: batchAlternate,
					seats: {
						0: { policy: batchA, search: { ...cpuSearch, budget: { nodes: batchNodes } } },
						1: { policy: batchB, search: { ...cpuSearch, budget: { nodes: batchNodes } } },
					},
				},
				(partial) => (batch = partial),
				() => batchStop
			)
		} finally {
			batchRunning = false
		}
	}

	const fmt = (n: number | null | undefined, digits = 0) =>
		n === null || n === undefined || !Number.isFinite(n) ? '–' : n.toFixed(digits)
	const strengthNow = (team: number) => {
		const points = $matchTimeline
		const last = points[points.length - 1]
		return last ? metricValue(last.teams[team], 'strength') : 0
	}
</script>

<svelte:head><title>ThunderLite — AI Playtest</title></svelte:head>

<div class="flex h-screen w-screen overflow-hidden bg-slate-900 text-slate-100">
	<!-- Controls. The match HUD pins a gear to the top-left corner of the viewport, so
	     the column starts below it. -->
	<aside
		class="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-700 p-4 pt-16"
	>
		<div>
			<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
			<h1 class="mt-1 text-lg font-bold">AI Playtest</h1>
		</div>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Scene</h2>
			<select bind:value={sceneIndex} class="w-full rounded bg-slate-800 px-2 py-1 text-sm">
				{#each devScenes as s, i (s.id)}
					<option value={i}>{s.name}</option>
				{/each}
			</select>
			<p class="mt-1 text-xs leading-snug text-slate-500">{scene.blurb}</p>
			<div class="mt-2 flex items-center gap-3 text-sm">
				<label class="flex items-center gap-1.5">
					<input type="checkbox" bind:checked={fog} />
					Fog
				</label>
				<label class="flex flex-1 items-center gap-1.5">
					Seed
					<input
						bind:value={seedText}
						placeholder="random"
						class="w-full rounded bg-slate-800 px-2 py-0.5 tabular-nums"
					/>
				</label>
			</div>
			<button
				class="mt-2 w-full rounded bg-slate-700 px-2 py-1 text-sm hover:bg-slate-600"
				onclick={rebuild}
			>
				Restart match
			</button>
		</section>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Seats</h2>
			<div class="flex flex-col gap-1">
				{#each teams as team (team)}
					<label class="flex items-center gap-2 text-sm">
						<span class="inline-block h-3 w-3 rounded-full" style="background:{teamColor(team)}"
						></span>
						<span class="w-14">Team {team}</span>
						<select
							bind:value={seats[team]}
							onchange={rebuild}
							class="flex-1 rounded bg-slate-800 px-2 py-0.5"
						>
							<option value="human">Human</option>
							<option value="greedy">Greedy</option>
							<option value="search">Search</option>
						</select>
					</label>
				{/each}
			</div>
		</section>

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Search</h2>
			<div class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
				<label class="flex items-center justify-between gap-2">
					Depth <input type="number" min="1" max="4" bind:value={maxDepth} class="knob" />
				</label>
				<label class="flex items-center justify-between gap-2">
					ms <input type="number" min="50" step="50" bind:value={budgetMs} class="knob" />
				</label>
				<label class="flex items-center justify-between gap-2">
					Nodes <input bind:value={budgetNodes} placeholder="time" class="knob" />
				</label>
				<label class="flex items-center justify-between gap-2">
					K <input type="number" min="1" max="6" bind:value={K} class="knob" />
				</label>
				<label class="flex items-center justify-between gap-2">
					B <input type="number" min="1" max="24" bind:value={B} class="knob" />
				</label>
				<label class="flex items-center justify-between gap-2">
					B<sub>opp</sub> <input type="number" min="1" max="12" bind:value={Bopp} class="knob" />
				</label>
				<label class="flex items-center justify-between gap-2">
					Contact <input type="number" min="1" max="20" bind:value={contactRadius} class="knob" />
				</label>
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={fast} />
					No animation
				</label>
			</div>
			<p class="mt-1 text-xs leading-snug text-slate-500">
				A node budget makes a run reproducible with a seed; time is what live play uses.
			</p>
		</section>

		<section>
			<div class="mb-2 flex items-center justify-between">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">
					Weights {changedCount > 0 ? `· ${changedCount} changed` : ''}
				</h2>
				<div class="flex gap-1">
					<button class="chip" onclick={resetWeights}>Reset</button>
					<button class="chip" onclick={copyWeights}>{copied ? 'Copied' : 'Copy JSON'}</button>
				</div>
			</div>
			<div class="flex flex-col gap-1">
				{#each WEIGHT_GROUPS as group (group.title)}
					<div class="rounded bg-slate-800/60">
						<button
							class="flex w-full items-center justify-between px-2 py-1 text-left text-sm"
							onclick={() => (openGroups[group.title] = !openGroups[group.title])}
						>
							<span>{group.title}</span>
							<span class="text-xs text-slate-500">{openGroups[group.title] ? '−' : '+'}</span>
						</button>
						{#if openGroups[group.title]}
							<div class="flex flex-col gap-1.5 px-2 pb-2">
								{#each group.keys as key (key)}
									{@const [lo, hi] = range(key)}
									<div class="text-xs">
										<div class="flex items-center justify-between">
											<span
												class="truncate font-mono {w[key] !== DEFAULT_WEIGHTS[key]
													? 'text-amber-300'
													: 'text-slate-300'}">{key}</span
											>
											<input
												type="number"
												step={step(key)}
												value={w[key]}
												oninput={(e) =>
													setWeight(key, Number((e.target as HTMLInputElement).value))}
												class="w-20 rounded bg-slate-900 px-1 py-0.5 text-right tabular-nums"
											/>
										</div>
										<input
											type="range"
											min={lo}
											max={hi}
											step={step(key)}
											value={w[key]}
											oninput={(e) => setWeight(key, Number((e.target as HTMLInputElement).value))}
											class="w-full"
										/>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	</aside>

	<!-- Readouts, as a second left column: the match HUD owns the right edge of the
	     viewport (its player panel and turn pill are position: fixed). -->
	<aside
		class="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-700 p-4 text-sm"
	>
		{@render readouts()}
	</aside>

	<!-- Board -->
	<main class="relative flex min-w-0 flex-1 flex-col pr-72">
		<div class="relative flex-1 overflow-hidden">
			{#if map}
				<DevMatch
					{map}
					{localTeam}
					{rebuildKey}
					fogOfWar={fog}
					{seed}
					{cpuPolicyFor}
					{cpuSearch}
					cpuFast={fast}
					{onCpuSearch}
					menuHref="/dev/playtest"
				/>
			{/if}
		</div>
		<div class="border-t border-slate-700 bg-slate-950/60 px-4 py-2">
			{#if map && teams.length > 0}
				<ScoreTimeline points={$matchTimeline} {teams} {labelFor} localTeam={-1} {winner} />
			{/if}
		</div>
	</main>
</div>

{#snippet readouts()}
	<section>
		<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Match</h2>
		<div class="flex items-center gap-2">
			<span
				class="inline-block h-3 w-3 rounded-full"
				style="background:{teamColor($gameState.currentTeam)}"
			></span>
			<span>Turn {$gameState.turnNumber} · team {$gameState.currentTeam}</span>
			<span class="ml-auto text-xs uppercase text-slate-500">{$gameState.phase}</span>
		</div>
		<div class="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-400">
			{#each teams as team (team)}
				<span><span style="color:{teamColor(team)}">●</span> {fmt(strengthNow(team))}</span>
			{/each}
		</div>
	</section>

	<section>
		<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
			Search telemetry
		</h2>
		{#if Object.keys(telemetry).length === 0}
			<p class="text-xs text-slate-500">No search has run yet. Give a seat the Search policy.</p>
		{/if}
		{#each Object.entries(telemetry) as [team, t] (team)}
			<div
				class="mb-2 rounded border-l-4 bg-slate-800 p-2"
				style="border-color:{teamColor(Number(team))}"
			>
				<div class="flex flex-wrap gap-x-3 text-xs tabular-nums">
					<span>d{t.depthCompleted}{t.truncated ? '·cut' : ''}</span>
					<span>{t.nodes} nodes</span>
					<span>{fmt(t.ms)} ms</span>
					<span>{t.rootPlans} plans</span>
					{#if t.skipped}<span class="text-amber-300">skipped (army too large)</span>{/if}
				</div>
				<div class="mt-1 text-xs">
					<span class="text-slate-400">chose</span>
					<span class="font-mono">{t.chosen}</span>
					<span class="text-slate-400">at</span>
					{fmt(t.chosenValue)}
					<span class="text-slate-400">· greedy</span>
					{fmt(t.greedyValue)}
				</div>
				<ul class="mt-1 max-h-32 overflow-y-auto text-[11px] text-slate-400">
					{#each t.plans as p (p.label)}
						<li class="flex justify-between gap-2 font-mono">
							<span class="truncate {p.label === t.chosen ? 'text-emerald-300' : ''}"
								>{p.label}</span
							>
							<span class="tabular-nums"
								>{fmt(p.value)} <span class="text-slate-600">d{p.depth}</span></span
							>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</section>

	<section>
		<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
			Eval vs actual
		</h2>
		{#if evalVsActual.length === 0}
			<p class="text-xs text-slate-500">
				Each searched turn's expected value against the strength gap the chart recorded after it.
			</p>
		{:else}
			{@const rows = evalVsActual.slice(-12)}
			{@const span = Math.max(
				1,
				...rows.flatMap((r) => [Math.abs(r.value), Math.abs(r.actual ?? 0)])
			)}
			<svg viewBox="0 0 320 90" class="w-full">
				<line x1="0" y1="45" x2="320" y2="45" stroke="#334155" />
				{#each rows as r, i (i)}
					{@const x = (i + 0.5) * (320 / rows.length)}
					<circle cx={x} cy={45 - (r.value / span) * 40} r="3" fill={teamColor(r.team)} />
					{#if r.actual !== null}
						<rect
							x={x - 3}
							y={45 - (r.actual / span) * 40 - 3}
							width="6"
							height="6"
							fill="none"
							stroke="#e2e8f0"
						/>
					{/if}
				{/each}
			</svg>
			<p class="text-[11px] text-slate-500">
				Dots: the search's expectation. Squares: what happened.
			</p>
		{/if}
	</section>

	<section>
		<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Eval overlay</h2>
		<select bind:value={selectedUnit} class="w-full rounded bg-slate-800 px-2 py-1 text-sm">
			<option value={null}>Off</option>
			{#each cpuUnits as { u, tile } (tile)}
				<option value={tile}>
					T{u.team}
					{unitData[u.type]?.name} @ {tile % (map?.cols ?? 1)},{Math.floor(tile / (map?.cols ?? 1))}
				</option>
			{/each}
		</select>
		<p class="mt-1 text-[11px] text-slate-500">
			Tints the unit's reachable tiles by position score and rings its favourite. Q toggles the HUD.
		</p>
	</section>

	<section>
		<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Batch</h2>
		<div class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
			<label class="flex items-center justify-between gap-2">
				Games <input type="number" min="1" max="200" bind:value={batchGames} class="knob" />
			</label>
			<label class="flex items-center justify-between gap-2">
				Rounds <input type="number" min="2" max="80" bind:value={batchRounds} class="knob" />
			</label>
			<label class="flex items-center justify-between gap-2">
				A
				<select bind:value={batchA} class="knob"
					><option value="greedy">Greedy</option><option value="search">Search</option></select
				>
			</label>
			<label class="flex items-center justify-between gap-2">
				B
				<select bind:value={batchB} class="knob"
					><option value="greedy">Greedy</option><option value="search">Search</option></select
				>
			</label>
			<label class="flex items-center justify-between gap-2">
				Nodes <input type="number" min="10" step="10" bind:value={batchNodes} class="knob" />
			</label>
			<label class="flex items-center gap-2">
				<input type="checkbox" bind:checked={batchAlternate} />
				Swap seats
			</label>
		</div>
		<div class="mt-2 flex gap-2">
			<button
				class="flex-1 rounded bg-emerald-600 px-2 py-1.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
				disabled={batchRunning}
				onclick={runTheBatch}
			>
				{batchRunning ? `Running ${batch?.games.length ?? 0}/${batchGames}` : 'Run headless'}
			</button>
			{#if batchRunning}
				<button class="chip" onclick={() => (batchStop = true)}>Stop</button>
			{/if}
		</div>
		{#if batch}
			<div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
				<span class="text-slate-400">A wins</span><span>{batch.wins[0] ?? 0}</span>
				<span class="text-slate-400">B wins</span><span>{batch.wins[1] ?? 0}</span>
				<span class="text-slate-400">Draw / unfinished</span><span>{batch.draws}</span>
				<span class="text-slate-400">Avg rounds</span><span>{fmt(batch.avgRounds, 1)}</span>
				<span class="text-slate-400">Avg gap (A − B)</span><span>{fmt(batch.avgGap)}</span>
				<span class="text-slate-400">Nodes / s</span><span>{fmt(batch.nodesPerSecond)}</span>
				<span class="text-slate-400">Avg depth</span><span>{fmt(batch.avgDepth, 2)}</span>
			</div>
			<ul class="mt-2 max-h-40 overflow-y-auto text-[11px] text-slate-400">
				{#each batch.games as g (g.seed)}
					<li class="flex justify-between font-mono">
						<span>#{g.seed}</span>
						<span>{g.winner === null ? '–' : g.winner === 0 ? 'A' : 'B'} · r{g.rounds}</span>
						<span class="tabular-nums">{fmt((g.strength[0] ?? 0) - (g.strength[1] ?? 0))}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/snippet}

<style>
	.knob {
		width: 4.5rem;
		border-radius: 0.25rem;
		background: rgb(30 41 59);
		padding: 0.125rem 0.375rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.chip {
		border-radius: 0.25rem;
		background: rgb(51 65 85);
		padding: 0.125rem 0.5rem;
		font-size: 0.75rem;
	}
	.chip:hover {
		background: rgb(71 85 105);
	}
</style>
