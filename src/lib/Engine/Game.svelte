<script lang="ts">
	import { terrainRenderer } from '$lib/GameData/terrain'
	import { skyRenderer } from '$lib/GameData/sky'
	import { unitRenderer } from '$lib/GameData/unit'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { onMount } from 'svelte'
	import type { imageColorizer } from '$lib/Sprites/imageColorizer'
	import type { createImageLoader } from '$lib/Sprites/images'

	export let map: MapObject
	export let colorizer: typeof imageColorizer
	export let makeImage: ReturnType<typeof createImageLoader>
	export let select = (x: number, y: number) => {
		const tile = y * map.cols + x
		console.log(tile, x, y) // todo game interactions
	}

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
		unit: (type?: number) =>
			typeof type !== 'undefined' ? $rendererStore.units[type] ?? null : null,
		sky: (type?: number) => (typeof type !== 'undefined' ? $rendererStore.sky[type] ?? null : null),
	}

	onMount(() => {
		const ground = terrainRenderer(makeImage, colorizer)(map.filters.ground(map.layers.ground))
		const units = unitRenderer(makeImage, colorizer)(map.filters.units(map.layers.units))
		const sky = skyRenderer(makeImage, colorizer)(map.filters.sky(map.layers.sky))

		rendererStore.update((store) => {
			store.ground = { ...store.ground, ...ground }
			store.units = { ...store.units, ...units }
			store.sky = { ...store.sky, ...sky }
			return store
		})
	})
</script>

<slot {interfacer} {select} {validTile} {renderData} />
