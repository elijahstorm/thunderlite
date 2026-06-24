<script lang="ts">
	import { onMount } from 'svelte'
	import { get } from 'svelte/store'
	import DevGrid from '$lib/Dev/DevGrid.svelte'
	import { devScenes } from '$lib/Dev/devScenes'
	import { unitData } from '$lib/GameData/unit'
	import { fogOfWarEnabled } from '$lib/Engine/fogState'
	import { generateMovementList } from '$lib/Engine/Interactor/Pathing/movement'
	import { generateAttackList } from '$lib/Engine/Interactor/Pathing/attack'
	import { scoreAttack, scorePositionBonus } from '$lib/Engine/cpuAi/score'
	import { threatToTile } from '$lib/Engine/cpuAi/evaluate'

	// The scoring functions read the attack list, which is sight-filtered only when
	// fog is on. These scenes play open-information, so pin fog off while the page
	// is mounted and restore on leave.
	onMount(() => {
		const prevFog = get(fogOfWarEnabled)
		fogOfWarEnabled.set(false)
		return () => fogOfWarEnabled.set(prevFog)
	})

	let sceneIndex = 1 // 'skirmish' — the inspector default
	$: scene = devScenes[sceneIndex]
	let cpuTeam = 1

	let map: MapObject
	let lastKey = ''
	$: key = `${scene.id}`
	$: if (key !== lastKey) {
		lastKey = key
		map = scene.build()
		selected = firstTeamUnit(map, cpuTeam)
	}

	const firstTeamUnit = (m: MapObject, team: number): number | null => {
		const i = m.layers.units.findIndex((u) => u?.team === team)
		return i < 0 ? null : i
	}
	$: if (map && (selected == null || map.layers.units[selected]?.team !== cpuTeam)) {
		selected = firstTeamUnit(map, cpuTeam)
	}

	let selected: number | null = null
	type Metric = 'position' | 'threat'
	let metric: Metric = 'position'

	$: unit = selected != null ? map?.layers.units[selected] : null

	$: reach = unit && selected != null ? generateMovementList(map, selected, unit) : []

	// Metric value per reachable tile.
	$: values = (() => {
		if (!unit) return new Map<number, number>()
		const m = new Map<number, number>()
		for (const t of reach) {
			m.set(
				t,
				metric === 'position'
					? scorePositionBonus(map, t, unit, cpuTeam)
					: threatToTile(map, t, unit, cpuTeam)
			)
		}
		return m
	})()

	$: best = (() => {
		let bt: number | null = null
		let bv = -Infinity
		for (const [t, v] of values) {
			// For threat, "best" = safest (lowest); for position, highest.
			const adj = metric === 'threat' ? -v : v
			if (adj > bv) {
				bv = adj
				bt = t
			}
		}
		return bt
	})()

	// Attack options from the unit's current tile.
	$: attacks = (() => {
		if (!unit || selected == null) return []
		const targets = generateAttackList(map, selected, unit)
		return targets
			.map((t) => {
				const enemy = map.layers.units[t]
				if (!enemy || enemy.team === cpuTeam) return null
				const s = scoreAttack(map, unit!, selected!, enemy, t)
				return { tile: t, enemy, ...s }
			})
			.filter((x): x is NonNullable<typeof x> => x !== null)
			.sort((a, b) => b.score - a.score)
	})()
	$: attackTiles = new Set(attacks.map((a) => a.tile))

	// Normalize a metric value to a 0..1 ramp across the reachable set.
	$: range = (() => {
		const vs = [...values.values()]
		return { min: Math.min(...vs), max: Math.max(...vs) }
	})()
	const heat = (v: number, min: number, max: number, metric: Metric) => {
		const span = max - min || 1
		let r = (v - min) / span // 0 low .. 1 high
		if (metric === 'threat') return `rgba(239,68,68,${0.15 + r * 0.6})` // more threat = redder
		const hue = 220 - r * 160 // 220 blue (low) → 60 yellow (high)
		return `hsla(${hue} 75% 50% / ${0.3 + r * 0.45})`
	}

	const overlay = (tile: number) => {
		if (attackTiles.has(tile)) return { ring: '#f87171', text: undefined }
		if (!values.has(tile)) return {}
		const v = values.get(tile)!
		return {
			bg: heat(v, range.min, range.max, metric),
			text: Math.round(v).toString(),
			textColor: '#fff',
			ring: tile === best ? '#ffffff' : undefined,
		}
	}

	const onTile = (tile: number) => {
		const u = map.layers.units[tile]
		if (u && u.team === cpuTeam) selected = tile
	}
</script>

<svelte:head><title>ThunderLite — AI Inspector</title></svelte:head>

<main class="min-h-screen bg-slate-900 p-6 text-slate-100">
	<header class="space-y-1">
		<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
		<h1 class="text-2xl font-bold">AI Inspector</h1>
		<p class="text-sm text-slate-400">
			The greedy per-unit scorer, made visible. Select one of the CPU team's units to see where it
			wants to stand (<code class="text-slate-300">scorePositionBonus</code>), the incoming threat at
			each tile, and its ranked attack options (<code class="text-slate-300">scoreAttack</code>).
		</p>
	</header>

	<div class="mt-6 flex flex-wrap gap-8">
		<div class="space-y-4">
			<div class="flex flex-wrap items-center gap-4">
				<div class="flex gap-2">
					{#each devScenes as s, i}
						<button
							class="rounded px-3 py-1.5 text-sm {i === sceneIndex
								? 'bg-yellow-500 font-semibold text-slate-900'
								: 'bg-slate-800 hover:bg-slate-700'}"
							on:click={() => (sceneIndex = i)}
						>
							{s.name}
						</button>
					{/each}
				</div>
				<label class="flex items-center gap-2 text-sm text-slate-400">
					CPU team
					<select bind:value={cpuTeam} class="rounded bg-slate-700 px-2 py-1">
						<option value={0}>0 (red)</option>
						<option value={1}>1 (blue)</option>
					</select>
				</label>
				<div class="flex overflow-hidden rounded border border-slate-700 text-sm">
					<button
						class="px-3 py-1 {metric === 'position' ? 'bg-slate-200 text-slate-900' : 'bg-slate-800'}"
						on:click={() => (metric = 'position')}
					>
						Position score
					</button>
					<button
						class="px-3 py-1 {metric === 'threat' ? 'bg-slate-200 text-slate-900' : 'bg-slate-800'}"
						on:click={() => (metric = 'threat')}
					>
						Incoming threat
					</button>
				</div>
			</div>

			{#if map}
				<DevGrid {map} {overlay} {onTile} {selected} cell={60} />
			{/if}
			<p class="max-w-2xl text-xs text-slate-500">
				{#if metric === 'position'}
					Blue → yellow = worse → better positional score across the reachable range. White ring =
					the tile the unit most wants to move to.
				{:else}
					Redder = more incoming damage if the unit stands there. White ring = safest reachable
					tile.
				{/if}
				Red ring = a tile the unit can attack from where it stands now.
			</p>
		</div>

		<aside class="w-80 space-y-4">
			<section class="rounded-lg border border-slate-700 bg-slate-800 p-4">
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
					Selected unit
				</h2>
				{#if unit}
					<p class="font-semibold">{unitData[unit.type].name}</p>
					<p class="text-xs text-slate-400">
						HP {unit.health ?? unitData[unit.type].health}/{unitData[unit.type].health} · range {unitData[
							unit.type
						].range.join('–')} · reachable {reach.length}
					</p>
				{:else}
					<p class="text-sm text-slate-500">Click a CPU unit on the board.</p>
				{/if}
			</section>

			<section class="rounded-lg border border-slate-700 bg-slate-800 p-4">
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
					Attack options (from current tile)
				</h2>
				{#if attacks.length === 0}
					<p class="text-sm text-slate-500">No targets in range.</p>
				{:else}
					<ul class="space-y-2 text-xs">
						{#each attacks as a, i}
							<li class="rounded bg-slate-900/60 p-2 {i === 0 ? 'ring-1 ring-emerald-500/60' : ''}">
								<div class="flex justify-between font-medium text-slate-200">
									<span>{unitData[a.enemy.type].name}</span>
									<span class="tabular-nums">score {a.score.toFixed(1)}</span>
								</div>
								<div class="text-slate-400">
									{a.damage} dmg{a.killsTarget ? ' · kills' : ''}{a.returnDamage
										? ` · ${a.returnDamage} return`
										: ''}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</aside>
	</div>
</main>
