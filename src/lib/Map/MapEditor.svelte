<script lang="ts">
	import { writable } from 'svelte/store'
	import ButtonGrid from './Editor/ButtonGrid.svelte'
	import MapRender from './MapRender.svelte'
	import Icon from '@iconify/svelte'
	import EditorButton from './Editor/EditorButton.svelte'
	import MapOptions from './MapOptions.svelte'
	import { terrainData } from '$lib/GameData/terrain'
	import { unitData } from '$lib/GameData/unit'
	import { mapStore } from './mapStore'
	import { addToast } from 'as-toast'
	import { spriteStore } from '$lib/Sprites/spriteStore'
	import { open, save } from './Editor/fileManager'
	import { deriveFromHash, mapHasher } from './Editor/mapExporter'
	import { share } from './Editor/mapShare'

	export let mapHash: string | undefined = undefined

	const maxTeamAmount = 4
	const size = 64

	const contextLoaded = writable(false)

	let openOptionsModal = false
	let editType: keyof MapLayers = 'units'
	let type: number = 0
	let team: number = 0
	let map: MapObject = $mapStore ?? deriveFromHash(mapHash)

	const actions = [
		{
			label: 'save',
			icon: 'fluent:save-24-filled',
			act: () => save(mapHasher(map)),
		},
		{
			label: 'open',
			icon: 'fluent:folder-32-filled',
			act: () => {
				open((content: string | null) => {
					if (content) {
						map = deriveFromHash(content)
					}
				})
			},
		},
		{
			label: 'share',
			icon: 'gg:share',
			act: () => share(map?.title ?? 'ThunderLite Online', mapHasher(map)),
		},
		{
			label: 'play',
			icon: 'solar:play-bold',
			act: () => {
				addToast(`Loading... JK not implemented yet!`)
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
					{#if $contextLoaded && editType !== 'ground'}
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
				{#if $contextLoaded}
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
			<MapRender pause {map} {select} {contextLoaded} />
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
	<MapRender pause mini map={updatedMap} select={() => {}} />
</MapOptions>
