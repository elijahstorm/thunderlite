<script lang="ts">
	import LocalInteracter from '$lib/Engine/Interactor/LocalInteracter.svelte'
	import MapRender from '$lib/Map/MapRender.svelte'
	import { deriveFromHash, mapHasher } from '$lib/Map/Editor/mapExporter'
	import { socketSelect } from '$lib/Components/Socket/socket'
	import { unitData } from '$lib/GameData/unit'
	import { terrainData } from '$lib/GameData/terrain'
	import { buildingData } from '$lib/GameData/building'

	const rows = 10
	const cols = 10

	const map = deriveFromHash(
		mapHasher({
			title: 'rose gold',
			cols,
			rows,
			layers: {
				ground: new Array(100).fill(0).map((_, index) => ({
					type:
						index % cols !== 4 && index % cols !== 6
							? 0
							: Math.floor(Math.random() * terrainData.length),
					state: 0,
				})),
				sky: [],
				units: new Array(rows * cols).fill(0).map((_, index) =>
					index % cols !== 2
						? null
						: {
								type: Math.floor(Math.random() * unitData.length),
								team: Math.floor(index / rows) % 4,
								state: 4,
						  }
				),
				buildings: new Array(rows * cols).fill(0).map((_, index) =>
					Math.floor(index / rows) === index % cols
						? {
								type: (index % cols) % buildingData.length,
								team: Math.floor(index / rows) % 5,
								state: 0,
						  }
						: null
				),
			},
		})
	)
</script>

<section class="h-screen">
	<LocalInteracter map={() => map} let:socket let:requestRedraw>
		<MapRender {map} {requestRedraw} select={socketSelect(socket, () => map)} />
	</LocalInteracter>
</section>
