<script lang="ts">
	import { unitData } from '$lib/GameData/unit'
	import { createImageLoader } from '$lib/Sprites/images'
	import MapRender from './MapRender.svelte'
	import { loadedState, mapStore } from './mapStore'

	const loadChecker = (finished: boolean) => loadedState.set(finished)

	let cols = 11
	let rows = 10

	const map: MapObject = $mapStore ?? {
		cols,
		rows,
		layers: {
			ground: new Array(cols * rows).fill(0).map((_, index) => ({
				type: Math.random() * 3 > 1 ? 4 : 0,
				state: 0,
			})),
			units: new Array(cols * rows).fill(0).map((_, index) =>
				index % cols !== 2
					? null
					: {
							type: Math.floor(Math.random() * unitData.length),
							team: index % 2,
							state: 4,
					  }
			),
			sky: new Array(cols * rows).fill(0).map((_, index) =>
				Math.floor(index / cols) !== 2
					? null
					: {
							type: Math.floor(Math.random() * 2),
							state: 0,
					  }
			),
		},
		filters: {
			ground: (active) => active.map((data) => data.type),
			units: (active) =>
				active.filter((data) => data !== null).map((data) => (data as ObjectType).type),
			sky: (active) =>
				active.filter((data) => data !== null).map((data) => (data as ObjectType).type),
		},
	}

	mapStore.set(map)
</script>

<div class="p-6 h-screen">
	<MapRender
		{map}
		select={undefined}
		makeImage={createImageLoader(loadChecker)}
		loaded={$loadedState}
	/>
</div>
