<script lang="ts">
	import { focusedTile, selectedTile } from '../uiState'
	import { terrainData } from '$lib/GameData/terrain'
	import { unitData } from '$lib/GameData/unit'
	import { buildingData } from '$lib/GameData/building'
	import { skyData } from '$lib/GameData/sky'
	import { isWalletUnit, walletOf } from '../wallet'
	import ModifierBadges from './ModifierBadges.svelte'

	export let map: MapObject | undefined = undefined
	/** The viewing team — a reinforcement telegraph is only ever shown to its owner. */
	export let localTeam: number = 0

	$: tile = $focusedTile
	$: pinned = $selectedTile !== null
	$: ground = map && tile != null ? map.layers.ground[tile] : null
	$: terrain = ground ? terrainData[ground.type] : null
	$: building = map && tile != null ? map.layers.buildings[tile] : null
	$: buildingInfo = building ? buildingData[building.type] : null
	$: sky = map && tile != null ? map.layers.sky[tile] : null
	$: skyInfo = sky ? skyData[sky.type] : null
	$: unit = map && tile != null ? map.layers.units[tile] : null
	$: unitInfo = unit ? unitData[unit.type] : null
	$: unitHpMax = unitInfo?.health ?? 0
	$: unitHp = unit?.health ?? unitHpMax
	// Only the owning team sees its own scripted reinforcement (matches the ghost marker).
	$: telegraph =
		map && tile != null && localTeam >= 0
			? (map.scheduledSpawns?.find((s) => s.tile === tile && s.team === localTeam) ?? null)
			: null
</script>

<div
	class="rounded bg-black/70 text-white text-xs font-mono p-3 min-w-[14rem] max-w-[16rem] pointer-events-auto select-none"
	data-testid="tile-info-panel"
>
	{#if tile == null}
		<div class="opacity-60">Hover or click a tile</div>
	{:else}
		{#if terrain}
			<div class="mb-2" data-testid="tile-info-terrain">
				<div class="font-bold">{terrain.name}</div>
				<div class="opacity-80">
					Protection: {Math.round(terrain.protection * 100)}%
				</div>
				<div class="opacity-80">Height: {terrain.height}</div>
				<ModifierBadges modifiers={terrain.modifiers} testid="tile-info-terrain-modifier" />
			</div>
		{/if}

		{#if skyInfo}
			<div class="mb-2 border-t border-white/20 pt-2" data-testid="tile-info-weather">
				<div class="font-bold">{skyInfo.name}</div>
				<div class="opacity-80">Cover: {Math.round(skyInfo.protection * 100)}%</div>
				<div class="opacity-80">Drag: {skyInfo.drag}×</div>
				<ModifierBadges modifiers={skyInfo.modifiers} testid="tile-info-weather-modifier" />
			</div>
		{/if}

		{#if building && buildingInfo}
			<div class="mb-2 border-t border-white/20 pt-2" data-testid="tile-info-building">
				<div class="font-bold">{buildingInfo.name}</div>
				<div class="opacity-80">Owner: Player {building.team + 1}</div>
				<div class="opacity-80">
					Stature: {building.stature ?? buildingInfo.stature}/{buildingInfo.stature}
				</div>
				<ModifierBadges modifiers={buildingInfo.modifiers} testid="tile-info-building-modifier" />
			</div>
		{/if}

		{#if unit && unitInfo}
			<div class="mb-1 border-t border-white/20 pt-2" data-testid="tile-info-unit">
				<div class="font-bold">{unitInfo.name}</div>
				<div class="opacity-80">Team: Player {unit.team + 1}</div>
				<div class="opacity-80">HP: {unitHp}/{unitHpMax}</div>
				{#if isWalletUnit(unit)}
					<div class="opacity-80" data-testid="tile-info-wallet">Holdings: ${walletOf(unit)}</div>
				{/if}
				<div class="opacity-80">Power: {unitInfo.power}</div>
				<div class="opacity-80">
					Range: {unitInfo.range[0]}–{unitInfo.range[1]}
				</div>
				<ModifierBadges modifiers={unitInfo.modifiers} testid="tile-info-modifier" />
			</div>
		{/if}

		{#if telegraph}
			<div class="mb-1 border-t border-white/20 pt-2" data-testid="tile-info-reinforcement">
				<div class="font-bold text-sky-300">Reinforcement inbound</div>
				<div class="opacity-80">{telegraph.unitName} arrives next turn</div>
				<div class="opacity-60 text-[11px]">Keep this tile clear or the drop is forfeited.</div>
			</div>
		{/if}

		{#if !building && !unit && !telegraph && !skyInfo}
			<div class="opacity-60 text-[11px]">Empty tile</div>
		{/if}
	{/if}
</div>
