<script lang="ts">
	import { focusedTile, selectedTile } from '../uiState'
	import { terrainData } from '$lib/GameData/terrain'
	import { unitData } from '$lib/GameData/unit'
	import { buildingData } from '$lib/GameData/building'
	import { skyData } from '$lib/GameData/sky'
	import { teamColor } from '../teamColors'
	import { isWalletUnit, walletOf } from '../wallet'
	import ModifierBadges from './ModifierBadges.svelte'
	import UnitSpritePreview from './UnitSpritePreview.svelte'
	import { spriteStore } from '$lib/Sprites/spriteStore'

	interface Props {
		map?: MapObject | undefined
		/** The viewing team — a reinforcement telegraph is only ever shown to its owner. */
		localTeam?: number
	}

	let { map = undefined, localTeam = 0 }: Props = $props()

	let tile = $derived($focusedTile)
	let pinned = $derived($selectedTile !== null)
	let ground = $derived(map && tile != null ? map.layers.ground[tile] : null)
	let terrain = $derived(ground ? terrainData[ground.type] : null)
	let building = $derived(map && tile != null ? map.layers.buildings[tile] : null)
	let buildingInfo = $derived(building ? buildingData[building.type] : null)
	let sky = $derived(map && tile != null ? map.layers.sky[tile] : null)
	let skyInfo = $derived(sky ? skyData[sky.type] : null)
	let unit = $derived(map && tile != null ? map.layers.units[tile] : null)
	let unitInfo = $derived(unit ? unitData[unit.type] : null)
	let unitHpMax = $derived(unitInfo?.health ?? 0)
	let unitHp = $derived(unit?.health ?? unitHpMax)
	let unitHpFraction = $derived(unitHpMax > 0 ? Math.max(0, Math.min(1, unitHp / unitHpMax)) : 0)
	// The unit's own idle sheet, so the panel shows the thing the cursor is on
	// instead of only naming it. Undefined until its sprites have decoded.
	let unitSprite = $derived(unit ? $spriteStore.units[unit.type]?.[unit.team] : undefined)
	// Only the owning team sees its own scripted reinforcement (matches the ghost marker).
	let telegraph = $derived(
		map && tile != null && localTeam >= 0
			? (map.scheduledSpawns?.find((s) => s.tile === tile && s.team === localTeam) ?? null)
			: null
	)

	let coords = $derived(
		map && tile != null ? `${tile % map.cols}, ${Math.floor(tile / map.cols)}` : ''
	)
	let pct = (value: number) => `${Math.round(value * 100)}%`
</script>

<div class="select-none text-xs" data-testid="tile-info-panel">
	<div class="mb-1.5 flex items-baseline justify-between gap-2">
		<span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
			{pinned ? 'Selected' : 'Tile'}
		</span>
		{#if coords}
			<span class="font-mono text-[10px] tabular-nums text-white/30">{coords}</span>
		{/if}
	</div>

	{#if tile == null}
		<p class="text-[11px] leading-relaxed text-white/40">
			Hover a tile to inspect it, or tap one to pin it here.
		</p>
	{:else}
		<div class="flex flex-col gap-2">
			{#if terrain}
				<section data-testid="tile-info-terrain">
					<h3 class="text-sm font-semibold leading-tight text-white/95">{terrain.name}</h3>
					<dl class="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
						<dt class="text-white/40">Cover</dt>
						<dd class="text-right font-mono tabular-nums text-white/80">
							{pct(terrain.protection)}
						</dd>
						<dt class="text-white/40">Height</dt>
						<dd class="text-right font-mono tabular-nums text-white/80">{terrain.height}</dd>
					</dl>
					<ModifierBadges modifiers={terrain.modifiers} testid="tile-info-terrain-modifier" />
				</section>
			{/if}

			{#if skyInfo}
				<section class="border-t border-white/10 pt-2" data-testid="tile-info-weather">
					<h3 class="text-sm font-semibold leading-tight text-white/95">{skyInfo.name}</h3>
					<dl class="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
						<dt class="text-white/40">Cover</dt>
						<dd class="text-right font-mono tabular-nums text-white/80">
							{pct(skyInfo.protection)}
						</dd>
						<dt class="text-white/40">Drag</dt>
						<dd class="text-right font-mono tabular-nums text-white/80">{skyInfo.drag}×</dd>
					</dl>
					<ModifierBadges modifiers={skyInfo.modifiers} testid="tile-info-weather-modifier" />
				</section>
			{/if}

			{#if building && buildingInfo}
				<section class="border-t border-white/10 pt-2" data-testid="tile-info-building">
					<div class="flex items-center gap-2">
						<span
							class="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/40"
							style="background:{teamColor(building.team)}"
						></span>
						<h3 class="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-white/95">
							{buildingInfo.name}
						</h3>
					</div>
					<dl class="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
						<dt class="text-white/40">Owner</dt>
						<dd class="truncate text-right text-white/80">Player {building.team + 1}</dd>
						<dt class="text-white/40">Stature</dt>
						<dd class="text-right font-mono tabular-nums text-white/80">
							{building.stature ?? buildingInfo.stature}/{buildingInfo.stature}
						</dd>
					</dl>
					<ModifierBadges modifiers={buildingInfo.modifiers} testid="tile-info-building-modifier" />
				</section>
			{/if}

			{#if unit && unitInfo}
				<section class="border-t border-white/10 pt-2" data-testid="tile-info-unit">
					<div class="flex items-start gap-2">
						<span
							class="shrink-0 overflow-hidden rounded border border-white/10 bg-black/30"
							aria-hidden="true"
						>
							<UnitSpritePreview image={unitSprite} type={unit.type} size={34} />
						</span>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1.5">
								<span
									class="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/40"
									style="background:{teamColor(unit.team)}"
								></span>
								<h3
									class="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-white/95"
								>
									{unitInfo.name}
								</h3>
							</div>
							<!-- HP as a bar as well as a number: the bar is what you read
							     mid-fight, the number is what you do the math with. -->
							<div class="mt-1 flex items-center gap-1.5">
								<span class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
									<span
										class="block h-full rounded-full transition-[width] duration-200 {unitHpFraction >
										0.5
											? 'bg-emerald-400'
											: unitHpFraction > 0.25
												? 'bg-amber-400'
												: 'bg-red-500'}"
										style="width:{unitHpFraction * 100}%"
									></span>
								</span>
								<span class="font-mono text-[10px] tabular-nums text-white/70">
									{unitHp}/{unitHpMax}
								</span>
							</div>
						</div>
					</div>
					<dl class="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
						<dt class="text-white/40">Power</dt>
						<dd class="text-right font-mono tabular-nums text-white/80">{unitInfo.power}</dd>
						<dt class="text-white/40">Range</dt>
						<dd class="text-right font-mono tabular-nums text-white/80">
							{unitInfo.range[0]}–{unitInfo.range[1]}
						</dd>
						{#if isWalletUnit(unit)}
							<dt class="text-white/40">Holdings</dt>
							<dd
								class="text-right font-mono tabular-nums text-emerald-300"
								data-testid="tile-info-wallet"
							>
								${walletOf(unit)}
							</dd>
						{/if}
					</dl>
					<ModifierBadges modifiers={unitInfo.modifiers} testid="tile-info-modifier" />
				</section>
			{/if}

			{#if telegraph}
				<section
					class="rounded-md border border-sky-400/30 bg-sky-400/10 p-2"
					data-testid="tile-info-reinforcement"
				>
					<h3 class="text-[11px] font-semibold text-sky-200">Reinforcement inbound</h3>
					<p class="text-[11px] text-white/75">{telegraph.unitName} arrives next turn</p>
					<p class="mt-0.5 text-[10px] leading-snug text-white/45">
						Keep this tile clear or the drop is forfeited.
					</p>
				</section>
			{/if}

			{#if !building && !unit && !telegraph && !skyInfo}
				<p class="border-t border-white/10 pt-2 text-[11px] text-white/35">Nothing else here.</p>
			{/if}
		</div>
	{/if}
</div>
