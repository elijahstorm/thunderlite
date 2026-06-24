<script lang="ts">
	import { focusedTile, selectedTile } from '../uiState'
	import { terrainData } from '$lib/GameData/terrain'
	import { unitData } from '$lib/GameData/unit'
	import { buildingData } from '$lib/GameData/building'

	export let map: MapObject | undefined = undefined

	$: tile = $focusedTile
	$: pinned = $selectedTile !== null
	$: ground = map && tile != null ? map.layers.ground[tile] : null
	$: terrain = ground ? terrainData[ground.type] : null
	$: building = map && tile != null ? map.layers.buildings[tile] : null
	$: buildingInfo = building ? buildingData[building.type] : null
	$: unit = map && tile != null ? map.layers.units[tile] : null
	$: unitInfo = unit ? unitData[unit.type] : null
	$: unitHpMax = unitInfo?.health ?? 0
	$: unitHp = unit?.health ?? unitHpMax
</script>

<div
	class="rounded bg-black/70 text-white text-xs font-mono p-3 min-w-[14rem] max-w-[16rem] pointer-events-auto select-none"
	data-testid="tile-info-panel"
>
	{#if tile == null}
		<div class="opacity-60">Hover or click a tile</div>
	{:else}
		<div class="flex items-center justify-end mb-1">
			<span class="opacity-60">{pinned ? 'pinned' : 'hover'}</span>
		</div>

		{#if terrain}
			<div class="mb-2" data-testid="tile-info-terrain">
				<div class="font-bold">{terrain.name}</div>
				<div class="opacity-80">
					Protection: {Math.round(terrain.protection * 100)}%
				</div>
				<div class="opacity-80">Height: {terrain.height}</div>
				{#if terrain.modifiers.length > 0}
					<div class="mt-1 flex flex-wrap gap-1">
						{#each terrain.modifiers as mod (mod)}
							<span
								class="px-1 py-px rounded bg-white/10 text-[10px]"
								data-testid="tile-info-terrain-modifier"
							>
								{mod}
							</span>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if building && buildingInfo}
			<div class="mb-2 border-t border-white/20 pt-2" data-testid="tile-info-building">
				<div class="font-bold">{buildingInfo.name}</div>
				<div class="opacity-80">Owner: Player {building.team + 1}</div>
				<div class="opacity-80">
					Stature: {building.stature ?? buildingInfo.stature}/{buildingInfo.stature}
				</div>
				{#if buildingInfo.modifiers.length > 0}
					<div class="mt-1 flex flex-wrap gap-1">
						{#each buildingInfo.modifiers as mod (mod)}
							<span
								class="px-1 py-px rounded bg-white/10 text-[10px]"
								data-testid="tile-info-building-modifier"
							>
								{mod}
							</span>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if unit && unitInfo}
			<div class="mb-1 border-t border-white/20 pt-2" data-testid="tile-info-unit">
				<div class="font-bold">{unitInfo.name}</div>
				<div class="opacity-80">Team: Player {unit.team + 1}</div>
				<div class="opacity-80">HP: {unitHp}/{unitHpMax}</div>
				<div class="opacity-80">Power: {unitInfo.power}</div>
				<div class="opacity-80">
					Range: {unitInfo.range[0]}–{unitInfo.range[1]}
				</div>
				{#if unitInfo.modifiers.length > 0}
					<div class="mt-1 flex flex-wrap gap-1">
						{#each unitInfo.modifiers as mod (mod)}
							<span
								class="px-1 py-px rounded bg-white/10 text-[10px]"
								data-testid="tile-info-modifier"
							>
								{mod}
							</span>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if !building && !unit}
			<div class="opacity-60 text-[11px]">Empty tile</div>
		{/if}
	{/if}
</div>
