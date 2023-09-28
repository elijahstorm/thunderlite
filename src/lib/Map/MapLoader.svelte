<script lang="ts">
	import { createImageLoader } from '$lib/Sprites/images'
	import MapRender from './MapRender.svelte'
	import { loadedState, mapStore } from './mapStore'
	import { get } from 'svelte/store'

	const loadChecker = (finished: boolean) => loadedState.set(finished)

	let rows = 11
	let cols = 10

	let map: MapObject

	map = get(mapStore) ?? {
		rows,
		cols,
		layers: {
			ground: new Array(rows * cols).fill(0).map((_, index) => ({
				type: Math.floor(Math.random() * 10),
			})),
			sky: new Array(rows * cols).fill(0).map((_, index) =>
				Math.random() * 10 < 0.3
					? null
					: {
							type: Math.floor(Math.random() * 2),
							tile: index * cols + rows,
					  }
			),
			units: new Array(rows * cols).fill(0).map((_, index) =>
				Math.random() * 2 < 1
					? null
					: {
							type: Math.floor(Math.random() * 2),
							tile: index * cols + rows,
							team: index % 2,
					  }
			),
		},
	}

	mapStore.set(map)
</script>

<MapRender {map} makeImage={createImageLoader(loadChecker)} loaded={$loadedState}>
	<p>loading...</p>
</MapRender>
