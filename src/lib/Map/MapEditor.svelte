<script lang="ts">
	import { terrainData } from '$lib/GameData/terrain'
	import { unitData } from '$lib/GameData/unit'
	import { createImageLoader } from '$lib/Sprites/images'
	import { connectionDecision } from '$lib/Sprites/spriteConnector'
	import ButtonGrid from './Editor/ButtonGrid.svelte'
	import MapRender from './MapRender.svelte'
	import { loadedState, mapStore } from './mapStore'
	import { get } from 'svelte/store'
	import Icon from '@iconify/svelte'

	const loadChecker = (finished: boolean) => loadedState.set(finished)

	let map: MapObject = get(mapStore) ?? {
		rows: 10,
		cols: 10,
		layers: {
			ground: new Array(100).fill(0).map((_) => ({
				type: 0,
				state: 0,
			})),
			units: [],
			sky: [],
		},
	}

	$: {
		map.layers.ground.map(
			(object, index) => (object.state = connectionDecision(object)(map, index))
		)

		mapStore.set(map)
	}

	const actions = [
		{
			label: 'save',
			icon: 'fluent:save-24-filled',
			act: () => {},
		},
		{
			label: 'open',
			icon: 'fluent:folder-32-filled',
			act: () => {},
		},
		{
			label: 'share',
			icon: 'fluent:open-12-regular',
			act: () => {},
		},
	]

	let select = (x: number, y: number) => {
		// todo editor interactions
		console.log({ x, y })
	}

	const size = 60
	$: style = `width: ${size}px; height: ${size}px;`
</script>

<div class="p-6 h-screen max-h-screen overflow-clip">
	<ButtonGrid rows={2} length={unitData.length} let:index>
		<button class="border border-black overflow-hidden" {style}>
			<img
				class="object-cover min-w-fit"
				src={unitData[index].url}
				alt={unitData[index].name}
				style="margin: {-unitData[index].yOffset + 2}px {-unitData[index].xOffset}px 0 0;"
			/>
		</button>
	</ButtonGrid>

	<div class="flex flex-1">
		<ButtonGrid cols={1} length={actions.length} let:index>
			<button class="border border-black overflow-hidden" {style}>
				<Icon icon={actions[index].icon} width={size} height={size - 25} />
				{actions[index].label}
			</button>
		</ButtonGrid>

		<div class="flex-1">
			<MapRender {map} {select} makeImage={createImageLoader(loadChecker)} loaded={$loadedState}>
				<p>loading...</p>
			</MapRender>
		</div>

		<ButtonGrid cols={2} length={terrainData.length} let:index>
			<button class="border border-black overflow-hidden" {style}>
				<img
					class="object-cover object-left-top min-w-fit"
					src={terrainData[index].url}
					alt={terrainData[index].name}
					style="margin: {-terrainData[index].yOffset}px {-terrainData[index].xOffset}px 0 0;"
				/>
			</button>
		</ButtonGrid>
	</div>
</div>
