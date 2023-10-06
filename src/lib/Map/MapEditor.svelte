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
	import EditorButton from './Editor/EditorButton.svelte'
	import { promiseColorized } from '$lib/Sprites/imageColorizer'

	const loadChecker = (finished: boolean) => loadedState.set(finished)

	const maxTeamAmount = 4
	const size = 64
	const unitRenders = new Array(maxTeamAmount)
		.fill([])
		.map((_) => new Array<Promise<string>>(unitData.length).fill(new Promise(() => null)))

	let editType: 'unit' | 'terrain' | 'weather'
	let type: number = 0
	let team: number = 0
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
			ground: (_) => Array.from({ length: terrainData.length }, (_, index) => index),
			units: (_) => Array.from({ length: unitData.length }, (_, index) => index),
			sky: (_) => Array.from({ length: skyData.length }, (_, index) => index),
		},
	}

	onMount(() => {
		editType = 'unit'
		type = 0
		team = 0

		unitRenders.map((unitList, team) =>
			unitList.map(
				(_, index) => (unitRenders[team][index] = promiseColorized(team)(unitData[index].url))
			)
		)
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

	const changeTeam = (index: number) => () => (team = index)
</script>

<div class="p-6 h-screen max-h-screen overflow-hidden flex flex-col">
	<div class="flex-grow flex">
		<div class="flex-grow">
			<ButtonGrid rows={2} length={maxTeamAmount} let:index>
				<EditorButton
					action={changeTeam(index)}
					selected={editType !== 'terrain' && team === index}
					{size}
				>
					{#await unitRenders[index][editType === 'terrain' ? 0 : type]}
						...
					{:then src}
						<img
							class="object-cover min-w-fit"
							{src}
							alt={unitData[editType === 'terrain' ? 0 : type].name}
							style="margin: {-unitData[editType === 'terrain' ? 0 : type].yOffset +
								6}px {-unitData[editType === 'terrain' ? 0 : type].xOffset}px 0 0;"
						/>
					{/await}
				</EditorButton>
			</ButtonGrid>
		</div>

		<ButtonGrid rows={2} length={unitData.length} let:index>
			<EditorButton
				action={changeType('unit', index)}
				selected={editType === 'unit' && type === index}
				{size}
			>
				{#await unitRenders[team][index]}
					...
				{:then src}
					<img
						class="object-cover min-w-fit"
						{src}
						alt={unitData[index].name}
						style="margin: {-unitData[index].yOffset + 6}px {-unitData[index].xOffset}px 0 0;"
					/>
				{/await}
			</EditorButton>
		</ButtonGrid>
	</div>

	<div class="flex overflow-hidden">
		<ButtonGrid cols={1} length={actions.length} let:index>
			<EditorButton action={actions[index].act} {size}>
				<Icon icon={actions[index].icon} width={size - 3} height={size - 33} />
				{actions[index].label}
			</EditorButton>
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
			<EditorButton
				action={changeType('terrain', index)}
				selected={editType === 'terrain' && type === index}
				{size}
			>
				<img
					class="object-cover object-left-top min-w-fit"
					src={terrainData[index].url}
					alt={terrainData[index].name}
					style="margin: {-terrainData[index].yOffset}px {-terrainData[index].xOffset}px 0 0;"
				/>
			</EditorButton>
		</ButtonGrid>
	</div>
</div>
