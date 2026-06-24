<script lang="ts">
	import DevGrid from '$lib/Dev/DevGrid.svelte'
	import { devScenes } from '$lib/Dev/devScenes'
	import { unitData } from '$lib/GameData/unit'
	import { terrainData } from '$lib/GameData/terrain'
	import { generateMovementList, drag, validTerrain } from '$lib/Engine/Interactor/Pathing/movement'

	let sceneIndex = 0
	$: scene = devScenes[sceneIndex]

	let map: MapObject
	let lastSceneId = ''
	$: if (scene.id !== lastSceneId) {
		lastSceneId = scene.id
		map = scene.build()
		selected = firstUnitTile(map)
		overrideType = selected != null ? (map.layers.units[selected]?.type ?? 0) : 0
	}

	const firstUnitTile = (m: MapObject): number | null => {
		const i = m.layers.units.findIndex((u) => u)
		return i < 0 ? null : i
	}

	let selected: number | null = null
	// Override the selected unit's type to compare movement profiles on one map.
	let overrideType = 0

	$: selectedUnit =
		selected != null && map?.layers.units[selected]
			? { ...map.layers.units[selected]!, type: overrideType }
			: null

	$: reachable =
		selected != null && selectedUnit
			? new Set(generateMovementList(map, selected, selectedUnit))
			: new Set<number>()

	// Single-step entry cost into each tile for the selected unit's profile.
	const entryCost = (tile: number): number | null => {
		if (!selectedUnit) return null
		const ground = map.layers.ground[tile]
		if (!validTerrain(ground, selectedUnit)) return null
		return drag(selectedUnit, ground, map.layers.sky[tile])
	}

	const overlay = (tile: number) => {
		if (selected == null) return {}
		if (tile === selected) return { ring: '#ffffff' }
		if (reachable.has(tile)) {
			const c = entryCost(tile)
			return {
				bg: 'rgba(34,197,94,0.45)',
				text: c != null && c < 9999 ? String(c) : undefined,
				textColor: '#dcfce7',
			}
		}
		return {}
	}

	const onTile = (tile: number) => {
		if (map.layers.units[tile]) {
			selected = tile
			overrideType = map.layers.units[tile]!.type
		}
	}

	$: stats = unitData[overrideType]

	// ── Cost reference: every terrain × the selected movement type ──────────────
	$: costRows = terrainData.map((t, ti) => ({
		name: t.name,
		cost: drag({ type: overrideType, team: 0, state: 0 } as UnitObject, { type: ti } as GroundObject),
		passable: validTerrain({ type: ti } as GroundObject, {
			type: overrideType,
			team: 0,
			state: 0,
		} as UnitObject),
	}))
</script>

<svelte:head><title>ThunderLite — Movement & Transport</title></svelte:head>

<main class="min-h-screen bg-slate-900 p-6 text-slate-100">
	<header class="space-y-1">
		<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
		<h1 class="text-2xl font-bold">Movement &amp; Transport</h1>
		<p class="text-sm text-slate-400">
			Reachable range and per-tile entry cost via the live
			<code class="text-slate-300">generateMovementList</code> / <code class="text-slate-300">drag</code>.
			Click a unit to select it; override its profile to compare movement types on the same map.
		</p>
	</header>

	<div class="mt-6 flex flex-wrap gap-8">
		<div class="space-y-4">
			<div class="flex flex-wrap gap-2">
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

			{#if map}
				<DevGrid {map} {overlay} {onTile} {selected} />
			{/if}
			<p class="max-w-xl text-xs text-slate-500">
				Green = reachable · number = cost to enter that tile · friendly units block the path but can
				be passed through; enemy units and impassable terrain stop it.
			</p>
		</div>

		<aside class="w-72 space-y-4">
			<section class="space-y-2 rounded-lg border border-slate-700 bg-slate-800 p-4">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Profile</h2>
				<label class="block text-sm">
					Override unit type
					<select bind:value={overrideType} class="mt-1 w-full rounded bg-slate-700 px-2 py-1">
						{#each unitData as u, i}<option value={i}>{u.name}</option>{/each}
					</select>
				</label>
				<dl class="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-400">
					<dt>Movement</dt>
					<dd class="text-right text-slate-200">{stats.movement}</dd>
					<dt>Type</dt>
					<dd class="text-right text-slate-200">{stats.movementType}</dd>
					<dt>Domain</dt>
					<dd class="text-right text-slate-200">{stats.type}</dd>
					<dt>Reachable tiles</dt>
					<dd class="text-right text-slate-200">{reachable.size}</dd>
				</dl>
			</section>

			<section class="space-y-2 rounded-lg border border-slate-700 bg-slate-800 p-4">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">
					Cost by terrain
				</h2>
				<table class="w-full text-xs">
					<tbody>
						{#each costRows as r}
							<tr class="border-b border-slate-700/50 last:border-0">
								<td class="py-1 text-slate-300">{r.name}</td>
								<td class="py-1 text-right tabular-nums">
									{#if !r.passable || r.cost >= 9999}
										<span class="text-red-400">✕</span>
									{:else}
										<span class="text-slate-200">{r.cost}</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		</aside>
	</div>
</main>
