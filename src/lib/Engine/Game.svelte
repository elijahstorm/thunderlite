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
		const ground = terrainRenderer(makeImage, colorizer)(map.filters.ground(map.layers.ground))
		const sky = skyRenderer(makeImage, colorizer)(map.filters.sky(map.layers.sky))
		const units = unitRenderer(makeImage, colorizer)(map.filters.units(map.layers.units))
		const attacks = attacksRenderer(makeImage, colorizer)(map.filters.units(map.layers.units))
		const buildings = buildingRenderer(
			makeImage,
			colorizer
		)(map.filters.buildings(map.layers.buildings))
		const animation = animationRenderer(
			makeImage,
			colorizer
		)(animationData.map((_, index) => index))

		rendererStore.update((store) => {
			store.ground = { ...store.ground, ...ground }
			store.sky = { ...store.sky, ...sky }
			store.units = { ...store.units, ...units }
			store.attacks = { ...store.attacks, ...attacks }
			store.buildings = { ...store.buildings, ...buildings }
			store.animation = { ...store.animation, ...animation }
			return store
		})
	})
</script>

<slot {interfacer} {select} {validTile} {renderData} />
