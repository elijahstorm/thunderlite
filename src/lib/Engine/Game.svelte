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
		ground: (type: number) => get(rendererStore).ground[type],
		unit: (type?: number) => (type ? get(rendererStore).units[type] ?? null : null),
		sky: (type?: number) => (type ? get(rendererStore).sky[type] ?? null : null),
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
			store.ground = { ...store.ground, ...ground }
			store.units = { ...store.units, ...units }
			store.sky = { ...store.sky, ...sky }
			return store
		})
	})
</script>

<slot {interfacer} {select} {validTile} {rows} {cols} {renderData} />
