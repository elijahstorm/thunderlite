<script lang="ts">
	import { skyData } from '$lib/GameData/Sky'
	import { terrainData } from '$lib/GameData/Terrain'
	import { unitData } from '$lib/GameData/Unit'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { onMount } from 'svelte'
	import { get } from 'svelte/store'

	export let map: MapObject
	export let makeImage: (url: string) => (signalLoaded: (image: HTMLImageElement) => void) => void

	let select = (x: number, y: number) => [x, y]
	let validTile = (x: number, y: number) => x < rows && y < cols

	const interfacer: InterfaceInteraction = (() => {
		return {
			selected: { x: -1, y: -1 },
			hover: { x: -1, y: -1 },
			offset: { x: 0, y: 0, zoom: 1 },
			key: { key: '', shift: false },
		}
	})()

	let rows = map.rows
	let cols = map.cols

	let renderData: ObjectRenderer = {
		ground: (type: number) => get(rendererStore).ground[type].sprite,
		unit: (type: number) => get(rendererStore).units[type].sprite,
		sky: (type: number) => get(rendererStore).sky[type].sprite,
	}

	onMount(() => {
		const ground = terrainData(makeImage)(map.layers.ground.map((data) => data.type))
		const units = unitData(makeImage)(
			map.layers.units.filter((data) => data !== null).map((data) => (data as ObjectType).type)
		)
		const sky = skyData(makeImage)(
			map.layers.sky.filter((data) => data !== null).map((data) => (data as ObjectType).type)
		)

		rendererStore.update((store) => {
			//@ts-ignore
			store.ground = { ...store.ground, ...ground }
			//@ts-ignore
			store.units = { ...store.units, ...units }
			//@ts-ignore
			store.sky = { ...store.sky, ...sky }
			return store
		})
	})
</script>

<slot {interfacer} {select} {validTile} {rows} {cols} {renderData} />
