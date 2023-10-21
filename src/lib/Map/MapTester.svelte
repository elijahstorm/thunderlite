<script lang="ts">
	import { buildingData } from '$lib/GameData/building'
	import { unitData } from '$lib/GameData/unit'
	import MapRender from './MapRender.svelte'
	import { mapStore } from './mapStore'

	let rows = 100
	let cols = 100

	const everything = <T,>(active: T[]) => active.map((data) => (data as ObjectType).type)
	const filter = <T,>(active: T[]) =>
		active.filter((data) => data !== null).map((data) => (data as ObjectType).type)

	const map: MapObject = $mapStore ?? {
		rows,
		cols,
		layers: {
			ground: new Array(rows * cols).fill(0).map((_, index) => ({
				type: Math.random() * 3 > 1 ? 4 : 0,
				state: 0,
			})),
			sky: new Array(rows * cols).fill(0).map((_, index) =>
				Math.random() * 100 > 7
					? null
					: {
							type: Math.floor(Math.random() * 2),
							tile: index * cols + rows,
							state: 0,
					  }
			),
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
			buildings: new Array(rows * cols).fill(0).map((_, index) =>
				Math.random() * 4 > 1
					? null
					: {
							type: Math.floor(Math.random() * buildingData.length),
							tile: index * cols + rows,
							team: index % 2,
							state: 0,
					  }
			),
		},
		filters: {
			ground: everything,
			sky: filter,
			units: filter,
			buildings: filter,
		},
	}

	mapStore.set(map)
</script>

<div class="p-6 h-screen">
	<MapRender {map} />
</div>
