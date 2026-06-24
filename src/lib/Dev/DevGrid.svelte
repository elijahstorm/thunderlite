<script lang="ts">
	import { terrainColor } from '$lib/Dev/devScenes'
	import { unitData } from '$lib/GameData/unit'
	import { buildingData } from '$lib/GameData/building'

	export let map: MapObject
	export let cell = 56
	/** Per-tile overlay. Return styling/labels to paint on top of a tile. */
	export let overlay: (tile: number) => {
		bg?: string
		text?: string
		textColor?: string
		ring?: string
	} = () => ({})
	export let onTile: (tile: number) => void = () => {}
	export let selected: number | null = null

	$: cols = map.cols
	$: rows = map.rows

	// Mirrors the in-game colorizer palette: 0 red, 1 blue, 2 green, 3 yellow, 4 grey (neutral).
	const teamColor = (team: number): string =>
		['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#94a3b8'][team] ?? '#94a3b8'
	const teamRing = (team: number): string =>
		['#fca5a5', '#93c5fd', '#86efac', '#fde047', '#cbd5e1'][team] ?? '#cbd5e1'

	const short = (name: string) =>
		name
			.split(' ')
			.map((w) => w[0])
			.join('')
			.slice(0, 3)
</script>

<div
	class="relative grid w-fit gap-px rounded bg-slate-950 p-px"
	style="grid-template-columns: repeat({cols}, {cell}px);"
>
	{#each Array(cols * rows) as _, tile}
		{@const o = overlay(tile)}
		{@const unit = map.layers.units[tile]}
		{@const bldg = map.layers.buildings[tile]}
		<button
			class="relative flex items-center justify-center text-[10px] font-semibold"
			style="width:{cell}px;height:{cell}px;background:{terrainColor(
				map.layers.ground[tile].type
			)};{selected === tile ? 'outline:2px solid #fff;outline-offset:-2px;z-index:2;' : ''}"
			on:click={() => onTile(tile)}
		>
			<!-- terrain overlay (heatmap / highlight) -->
			{#if o.bg}
				<span class="pointer-events-none absolute inset-0" style="background:{o.bg};"></span>
			{/if}
			{#if o.ring}
				<span
					class="pointer-events-none absolute inset-0"
					style="box-shadow: inset 0 0 0 2px {o.ring};"
				></span>
			{/if}

			<!-- building marker -->
			{#if bldg}
				<span
					class="pointer-events-none absolute left-0.5 top-0.5 rounded-sm px-1 text-[8px] leading-tight text-white"
					style="background:{teamColor(bldg.team)};"
					title={buildingData[bldg.type]?.name}
				>
					⌂
				</span>
			{/if}

			<!-- unit marker -->
			{#if unit}
				<span
					class="pointer-events-none absolute bottom-1 flex h-6 w-6 items-center justify-center rounded-full text-[9px] text-white"
					style="background:{teamColor(unit.team)};box-shadow:0 0 0 1.5px {teamRing(unit.team)};"
					title={unitData[unit.type]?.name}
				>
					{short(unitData[unit.type]?.name ?? '?')}
				</span>
			{/if}

			<!-- overlay text (score / cost) -->
			{#if o.text}
				<span
					class="pointer-events-none relative z-1 tabular-nums"
					style="color:{o.textColor ?? '#fff'};text-shadow:0 1px 2px #000;"
				>
					{o.text}
				</span>
			{/if}
		</button>
	{/each}
</div>
