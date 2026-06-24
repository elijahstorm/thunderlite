<script lang="ts">
	import { unitData } from '$lib/GameData/unit'
	import { terrainData } from '$lib/GameData/terrain'
	import {
		COMBAT_TERRAINS,
		terrainIndex,
		resolveDuel,
		damageMatrix,
	} from '$lib/Dev/combatSim'

	const terrainOptions = COMBAT_TERRAINS.map((name) => ({ name, idx: terrainIndex(name) }))

	let attackerType = 0
	let defenderType = Math.min(1, unitData.length - 1)
	let attackerTerrain = terrainOptions[0].idx
	let defenderTerrain = terrainOptions[0].idx
	let attackerHp = 1
	let defenderHp = 1

	$: duel = resolveDuel({
		attackerType,
		defenderType,
		attackerTerrain,
		defenderTerrain,
		attackerHp,
		defenderHp,
	})

	// Health bar helper.
	const pct = (v: number, max: number) => (max > 0 ? Math.round((v / max) * 100) : 0)

	// ── Matrix view ────────────────────────────────────────────────────────────
	let showMatrix = false
	let matrixTerrain = terrainOptions[0].idx
	$: matrix = showMatrix ? damageMatrix(matrixTerrain) : []
	// Color a damage cell from cold (low) to hot (lethal) relative to defender max HP.
	const cellColor = (dmg: number, defMax: number) => {
		const r = defMax > 0 ? Math.min(1, dmg / defMax) : 0
		if (r === 0) return 'background:rgba(100,116,139,0.15)'
		const hue = 50 - r * 50 // 50 (yellow) → 0 (red)
		return `background:hsl(${hue} 80% ${22 + r * 18}%)`
	}
</script>

<svelte:head><title>ThunderLite — Combat Lab</title></svelte:head>

<main class="min-h-screen space-y-8 bg-slate-900 p-6 text-slate-100">
	<header class="space-y-1">
		<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
		<h1 class="text-2xl font-bold">Combat Lab</h1>
		<p class="text-sm text-slate-400">
			Every number routes through the live <code class="text-slate-300">previewDamage</code> /
			<code class="text-slate-300">canCounterAttack</code> engine code — matchup, terrain defense,
			the high-ground bonus and damage modifiers all included.
		</p>
	</header>

	<!-- ── Duel ──────────────────────────────────────────────────────────── -->
	<section class="grid gap-6 lg:grid-cols-[1fr_1fr_auto]">
		<!-- Attacker -->
		<div class="space-y-3 rounded-lg border border-red-500/30 bg-slate-800 p-4">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-red-300">Attacker</h2>
			<label class="block text-sm">
				Unit
				<select bind:value={attackerType} class="mt-1 w-full rounded bg-slate-700 px-2 py-1">
					{#each unitData as u, i}<option value={i}>{u.name}</option>{/each}
				</select>
			</label>
			<label class="block text-sm">
				Stands on
				<select bind:value={attackerTerrain} class="mt-1 w-full rounded bg-slate-700 px-2 py-1">
					{#each terrainOptions as t}<option value={t.idx}>{t.name}</option>{/each}
				</select>
			</label>
			<label class="block text-sm">
				HP {pct(duel.attackerHealth, duel.attackerMax)}% ({duel.attackerHealth}/{duel.attackerMax})
				<input type="range" min="0.05" max="1" step="0.05" bind:value={attackerHp} class="w-full" />
			</label>
		</div>

		<!-- Defender -->
		<div class="space-y-3 rounded-lg border border-sky-500/30 bg-slate-800 p-4">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-sky-300">Defender</h2>
			<label class="block text-sm">
				Unit
				<select bind:value={defenderType} class="mt-1 w-full rounded bg-slate-700 px-2 py-1">
					{#each unitData as u, i}<option value={i}>{u.name}</option>{/each}
				</select>
			</label>
			<label class="block text-sm">
				Stands on
				<select bind:value={defenderTerrain} class="mt-1 w-full rounded bg-slate-700 px-2 py-1">
					{#each terrainOptions as t}<option value={t.idx}>{t.name}</option>{/each}
				</select>
			</label>
			<label class="block text-sm">
				HP {pct(duel.defenderHealth, duel.defenderMax)}% ({duel.defenderHealth}/{duel.defenderMax})
				<input type="range" min="0.05" max="1" step="0.05" bind:value={defenderHp} class="w-full" />
			</label>
		</div>

		<!-- Outcome -->
		<div class="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-4 lg:w-64">
			<div>
				<p class="text-xs uppercase tracking-wide text-slate-400">Strike</p>
				<p class="text-2xl font-bold text-red-300">{duel.damage} dmg</p>
				<p class="text-xs text-slate-400">
					defender → {duel.defenderHealthAfter}/{duel.defenderMax}
					{#if duel.defenderHealthAfter === 0}<span class="text-red-400"> (destroyed)</span>{/if}
				</p>
				<div class="mt-1 h-2 overflow-hidden rounded bg-slate-700">
					<div
						class="h-full bg-sky-400 transition-all"
						style="width:{pct(duel.defenderHealthAfter, duel.defenderMax)}%"
					></div>
				</div>
			</div>
			<div>
				<p class="text-xs uppercase tracking-wide text-slate-400">Counter</p>
				{#if duel.canCounter}
					<p class="text-2xl font-bold text-sky-300">{duel.counterDamage} dmg</p>
					<p class="text-xs text-slate-400">attacker → {duel.attackerHealthAfter}/{duel.attackerMax}</p>
					<div class="mt-1 h-2 overflow-hidden rounded bg-slate-700">
						<div
							class="h-full bg-red-400 transition-all"
							style="width:{pct(duel.attackerHealthAfter, duel.attackerMax)}%"
						></div>
					</div>
				{:else}
					<p class="text-sm text-slate-500">No counter (out of range, ranged, or destroyed)</p>
				{/if}
			</div>

			<div class="space-y-1 border-t border-slate-700 pt-3 text-xs text-slate-400">
				<p class="font-semibold text-slate-300">Factors</p>
				<p>Matchup bonus: ×{duel.factors.matchup}</p>
				<p>Defender terrain guard: −{Math.round(duel.factors.defenderProtection * 100)}%</p>
				<p>
					Height advantage: {duel.factors.heightTierAdvantage > 0
						? `+${duel.factors.heightTierAdvantage} tier (downhill bonus)`
						: duel.factors.heightTierAdvantage < 0
							? `${duel.factors.heightTierAdvantage} tier (no penalty)`
							: 'level'}
				</p>
			</div>
		</div>
	</section>

	<!-- ── Matrix ────────────────────────────────────────────────────────── -->
	<section class="space-y-3">
		<div class="flex flex-wrap items-center gap-4">
			<button
				class="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
				on:click={() => (showMatrix = !showMatrix)}
			>
				{showMatrix ? 'Hide' : 'Show'} full damage matrix
			</button>
			{#if showMatrix}
				<label class="flex items-center gap-2 text-sm text-slate-400">
					Terrain
					<select bind:value={matrixTerrain} class="rounded bg-slate-700 px-2 py-1">
						{#each terrainOptions as t}<option value={t.idx}>{t.name}</option>{/each}
					</select>
				</label>
				<span class="text-xs text-slate-500">rows attack columns · full HP · damage dealt</span>
			{/if}
		</div>

		{#if showMatrix}
			<div class="overflow-auto rounded-lg border border-slate-700">
				<table class="border-collapse text-xs">
					<thead>
						<tr>
							<th class="sticky left-0 z-10 bg-slate-800 p-2 text-left text-slate-400">atk \ def</th>
							{#each unitData as u}
								<th class="whitespace-nowrap bg-slate-800 p-2 text-slate-400" title={u.name}>
									{u.name.split(' ')[0]}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each matrix as row, a}
							<tr>
								<th
									class="sticky left-0 z-10 whitespace-nowrap bg-slate-800 p-2 text-left text-slate-300"
									title={unitData[a].name}
								>
									{unitData[a].name.split(' ')[0]}
								</th>
								{#each row as dmg, d}
									<td
										class="p-2 text-center tabular-nums text-slate-100"
										style={cellColor(dmg, unitData[d].health)}
										title="{unitData[a].name} → {unitData[d].name}: {dmg}"
									>
										{dmg}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</main>
