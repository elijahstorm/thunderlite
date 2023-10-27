<script lang="ts">
	import LocalInteracter from '$lib/Engine/Interactor/LocalInteracter.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import MapRender from '$lib/Map/MapRender.svelte'
	import { deriveFromHash, mapHasher } from '$lib/Map/Editor/mapExporter'
	import { socketSelect } from '$lib/Components/Socket/socket'
	import { unitData } from '$lib/GameData/unit'
	import { terrainData } from '$lib/GameData/terrain'
	import { buildingData } from '$lib/GameData/building'
	import { writable } from 'svelte/store'
	import { rendererStore } from '$lib/Sprites/spriteStore'

	export let data
	$: userSession = data.userSession
	$: gameSession = data.gameSession

	const contextLoaded = writable(!!$rendererStore.ground[0]?.sprite)

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
							? index % cols > 5
								? 0
								: 11
							: Math.floor(Math.random() * terrainData.length),
					state: 0,
				})),
				sky: [],
				units: new Array(rows * cols).fill(0).map((_, index) =>
					index % cols !== 2 && index % cols !== 8
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

<section class="m-auto">
	<LocalInteracter map={() => map} let:socket let:requestRedraw>
		<GameStateManager
			{userSession}
			{gameSession}
			interactor={socketSelect(socket, () => map)}
			let:select
		>
			<MapRender {map} {requestRedraw} {select} {contextLoaded} />
		</GameStateManager>
	</LocalInteracter>

	{#if $contextLoaded}
		<div class="fixed right-0 top-0 opacity-30 hover:opacity-100">
			<MapRender mini pause {map} {contextLoaded} />
		</div>
	{/if}
</section>
