<script lang="ts">
	import { createImageLoader } from '$lib/Sprites/images'
	import MapRender from './MapRender.svelte'
	import { loadedState, mapStore } from './mapStore'
	import { get } from 'svelte/store'

	const loadChecker = (finished: boolean) => loadedState.set(finished)

	let rows = 100
	let cols = 100

	let map: MapObject

	map = get(mapStore) ?? {
		rows,
		cols,
		layers: {
			ground: new Array(rows * cols).fill(0).map((_, index) => ({
				type: Math.floor(Math.random() * 18),
				state: 0,
			})),
			sky: new Array(rows * cols).fill(0).map((_, index) =>
				Math.random() * 100 > 7
					? null
					: {
							type: 1,
							tile: index * cols + rows,
							state: 0,
					  }
			),
			units: new Array(rows * cols).fill(0).map((_, index) =>
				Math.random() * 3 > 1
					? null
					: {
							type: 1,
							tile: index * cols + rows,
							team: index % 2,
							state: 0,
					  }
			),
		},
	}

	mapStore.set(map)
</script>

<MapRender {map} makeImage={createImageLoader(loadChecker)} loaded={$loadedState}>
	<p>loading...</p>
</MapRender>
