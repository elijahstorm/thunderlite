<script lang="ts">
	import { onMount } from 'svelte'
	import { terrainRenderer } from '$lib/GameData/terrain'
	import { skyRenderer } from '$lib/GameData/sky'
	import { attacksRenderer, unitRenderer } from '$lib/GameData/unit'
	import { buildingRenderer } from '$lib/GameData/building'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import type { imageColorizer } from '$lib/Sprites/imageColorizer'
	import type { createImageLoader } from '$lib/Sprites/images'
	import { animationData, animationRenderer } from '$lib/GameData/animation'

	export let map: MapObject
	export let colorizer: ReturnType<typeof imageColorizer>
	export let makeImage: ReturnType<typeof createImageLoader>
	export let select = (x: number, y: number) => {}

	let validTile = (x: number, y: number) => x < map.cols && y < map.rows

	const interfacer: InterfaceInteraction = (() => {
		return {
			selected: { x: -1, y: -1 },
			hover: { x: -1, y: -1 },
			offset: { x: 0, y: 0, zoom: 1 },
			key: { key: '', shift: false },
		}
	})()

	let renderData: ObjectRenderer = {
		ground: (type: number) => $rendererStore.ground[type],
		sky: (type?: number) => (typeof type !== 'undefined' ? $rendererStore.sky[type] ?? null : null),
		unit: (type?: number) =>
			typeof type !== 'undefined' ? $rendererStore.units[type] ?? null : null,
		building: (type?: number) =>
			typeof type !== 'undefined' ? $rendererStore.buildings[type] ?? null : null,
	}

	onMount(() => {
		const [ground, sky, units, attacks, buildings, animation] = [
			terrainRenderer,
			skyRenderer,
			unitRenderer,
			attacksRenderer,
			buildingRenderer,
			animationRenderer,
		].map((renderer) => renderer(makeImage, colorizer))

		rendererStore.update((store) => ({
			ground: { ...store.ground, ...ground(map.filters.ground(map.layers.ground)) },
			sky: { ...store.sky, ...sky(map.filters.sky(map.layers.sky)) },
			units: { ...store.units, ...units(map.filters.units(map.layers.units)) },
			attacks: { ...store.attacks, ...attacks(map.filters.units(map.layers.units)) },
			buildings: {
				...store.buildings,
				...buildings(map.filters.buildings(map.layers.buildings)),
			},
			animation: { ...store.animation, ...animation(animationData.map((_, index) => index)) },
		}))
	})
</script>

<slot {interfacer} {select} {validTile} {renderData} />
