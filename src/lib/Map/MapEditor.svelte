<script lang="ts">
	import { unitData } from '$lib/GameData/unit'
	import { createImageLoader } from '$lib/Sprites/images'
	import { connectionDecision } from '$lib/Sprites/spriteConnector'
	import MapRender from './MapRender.svelte'
	import { loadedState, mapStore } from './mapStore'
	import { get } from 'svelte/store'

	const loadChecker = (finished: boolean) => loadedState.set(finished)

	let rows = 100
	let cols = 100

	const map: MapObject = get(mapStore) ?? {
		rows,
		cols,
		layers: {
			ground: new Array(rows * cols).fill(0).map((_, index) => ({
				type: Math.random() * 3 > 1 ? 15 : 0,
				state: 0,
			})),
			units: new Array(rows * cols).fill(0).map((_, index) =>
				Math.random() * 4 > 1
					? null
					: {
							type: Math.floor(Math.random() * unitData.length),
							tile: index * cols + rows,
							team: index % 2,
							state: 4,
					  }
			),
			sky: new Array(rows * cols).fill(0).map((_, index) =>
				Math.random() * 100 > 7
					? null
					: {
							type: Math.floor(Math.random() * 2),
							tile: index * cols + rows,
							state: 0,
					  }
			),
		},
	}

	map.layers.ground.map((object, index) => (object.state = connectionDecision(object)(map, index)))

	mapStore.set(map)
</script>

<MapRender {map} makeImage={createImageLoader(loadChecker)} loaded={$loadedState}>
	<p>loading...</p>
</MapRender>
