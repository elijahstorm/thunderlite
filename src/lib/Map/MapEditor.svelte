<script lang="ts">
	import { terrainData } from '$lib/GameData/terrain'
	import { unitData } from '$lib/GameData/unit'
	import { createImageLoader } from '$lib/Sprites/images'
	import ButtonGrid from './Editor/ButtonGrid.svelte'
	import MapRender from './MapRender.svelte'
	import { loadedState, mapStore } from './mapStore'
	import Icon from '@iconify/svelte'
	import { skyData } from '$lib/GameData/sky'
	import EditorButton from './Editor/EditorButton.svelte'
	import MapOptions from './MapOptions.svelte'
	import { addToast } from 'as-toast'
	import { spriteStore } from '$lib/Sprites/spriteStore'

	const makeImage = createImageLoader((finished: boolean) => loadedState.set(finished))

	const maxTeamAmount = 4
	const size = 64

	let openOptionsModal = false
	let editType: keyof MapLayers = 'units'
	let type: number = 0
	let team: number = 0
	let map: MapObject = $mapStore ?? {
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
			act: () => {
				addToast(`Loading...`)
			},
		},
		{
			label: 'options',
			icon: 'gis:map-options',
			act: () => (openOptionsModal = !openOptionsModal),
		},
	]

	const select = (x: number, y: number) => {
		const tile = y * map.cols + x
		if (editType === 'units') {
			map.layers.units[tile] = { type, team, state: 4 }
		} else if (editType === 'ground') {
			map.layers.ground[tile] = { type, state: 0 }
		}
	}

	const changeType = (selectedType: typeof editType, index: number) => () => {
		editType = selectedType
		type = index
	}

	const changeTeam = (index: number) => () => (team = index)

	$: mapStore.set(map)
</script>

<grid class="p-6 h-screen max-h-screen overflow-hidden flex flex-col select-none">
	<div class="flex-grow flex">
		<div class="flex-grow">
			<ButtonGrid rows={2} length={maxTeamAmount} let:index>
				<EditorButton
					action={changeTeam(index)}
					selected={editType !== 'ground' && team === index}
					disabled={editType === 'ground'}
					{size}
				>
					{#if $loadedState && editType !== 'ground'}
						<img
							class="object-cover min-w-fit"
							src={$spriteStore[editType][type][index].src}
							alt={unitData[type].name}
							style="margin: {-unitData[type].yOffset + 6}px {-unitData[type].xOffset}px 0 0;"
						/>
					{:else}
						...
					{/if}
				</EditorButton>
			</ButtonGrid>
		</div>

		<ButtonGrid rows={2} length={unitData.length} let:index>
			<EditorButton
				action={changeType('units', index)}
				selected={editType === 'units' && type === index}
				{size}
			>
				{#if $loadedState}
					<img
						class="object-cover min-w-fit"
						src={$spriteStore['units'][index][team].src}
						alt={unitData[index].name}
						style="margin: {-unitData[index].yOffset + 6}px {-unitData[index].xOffset}px 0 0;"
					/>
				{:else}
					...
				{/if}
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
			<MapRender pause {map} {select} {makeImage} loaded={$loadedState} />
		</div>

		<ButtonGrid cols={2} length={terrainData.length} let:index>
			<EditorButton
				action={changeType('ground', index)}
				selected={editType === 'ground' && type === index}
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
</grid>

<MapOptions
	{map}
	bind:open={openOptionsModal}
	apply={(appliedChanges) => (map = appliedChanges)}
	let:updatedMap
>
	<MapRender pause mini map={updatedMap} select={() => {}} {makeImage} loaded={$loadedState} />
</MapOptions>
