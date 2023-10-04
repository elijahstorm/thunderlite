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
	import { onMount } from 'svelte'
	import { skyData } from '$lib/GameData/sky'
	import { animationFrame } from '$lib/Sprites/animationFrameCount'

	const loadChecker = (finished: boolean) => loadedState.set(finished)

	let editType: 'unit' | 'terrain' | 'weather'
	let type: number
	let team: number
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
		filters: {
			ground: (active) => Array.from({ length: terrainData.length }, (_, index) => index),
			units: (active) => Array.from({ length: unitData.length }, (_, index) => index),
			sky: (active) => Array.from({ length: skyData.length }, (_, index) => index),
		},
	}

	onMount(() => {
		editType = 'unit'
		type = 0
		team = 0
	})

	$: {
		map.layers.ground.map(
			(object, index) => (object.state = connectionDecision(object)(map, index))
		)

		mapStore.set(map)
		animationFrame.update((frame) => frame + 4)
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
			icon: 'gg:share',
			act: () => {},
		},
		{
			label: 'play',
			icon: 'solar:play-bold',
			act: () => {},
		},
	]

	const select = (x: number, y: number) => {
		const tile = x + y * map.rows
		if (editType === 'unit') {
			map.layers.units[tile] = { type, tile, team, state: 4 }
		} else if (editType === 'terrain') {
			map.layers.ground[tile] = { type, state: 0 }
		}
	}

	const changeType = (selectedType: typeof editType, index: number) => () => {
		editType = selectedType
		type = index
	}

	const size = 64
	$: style = `width: ${size}px; height: ${size}px;`
</script>

<div class="p-6 h-screen max-h-screen overflow-clip">
	<ButtonGrid rows={2} length={unitData.length} let:index>
		<button
			on:click={changeType('unit', index)}
			class="border-2 border-black overflow-hidden transition-colors hover:border-yellow-400 hover:bg-yellow-100"
			class:border-yellow-500={editType === 'unit' && type === index}
			class:bg-yellow-200={editType === 'unit' && type === index}
			{style}
		>
			<img
				class="object-cover min-w-fit"
				src={unitData[index].url}
				alt={unitData[index].name}
				style="margin: {-unitData[index].yOffset + 6}px {-unitData[index].xOffset}px 0 0;"
			/>
		</button>
	</ButtonGrid>

	<div class="flex flex-1">
		<ButtonGrid cols={1} length={actions.length} let:index>
			<button
				class="border border-black overflow-hidden transition-colors hover:border-yellow-400 hover:bg-yellow-100"
				{style}
			>
				<Icon icon={actions[index].icon} width={size} height={size - 25} />
				{actions[index].label}
			</button>
		</ButtonGrid>

		<div class="flex-1">
			<MapRender
				pause
				{map}
				{select}
				makeImage={createImageLoader(loadChecker)}
				loaded={$loadedState}
			/>
		</div>

		<ButtonGrid cols={2} length={terrainData.length} let:index>
			<button
				on:click={changeType('terrain', index)}
				class="border-2 border-black overflow-hidden transition-colors hover:border-yellow-400 hover:bg-yellow-100"
				class:border-yellow-500={editType === 'terrain' && type === index}
				class:bg-yellow-200={editType === 'terrain' && type === index}
				{style}
			>
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
