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
	import { rendererStore, spriteStore } from '$lib/Sprites/spriteStore'
	import { open, save } from './Editor/fileManager'
	import { deriveFromHash, mapHasher } from './Editor/mapExporter'
	import { share } from './Editor/mapShare'
	import { skyData } from '$lib/GameData/sky'
	import { buildingData } from '$lib/GameData/building'

	export let mapHash: string | undefined = undefined

	const maxTeamAmount = 4
	const size = 64
	const contextLoaded = writable(!!$rendererStore.ground[0]?.sprite)

	let openOptionsModal = false
	let editType: keyof MapLayers = 'units'
	let type: number = 0
	let team: number = 0
	let map: MapObject = $mapStore ?? deriveFromHash(mapHash)

	map.filters = {
		ground: () => Array.from({ length: terrainData.length }, (_, index) => index),
		sky: () => Array.from({ length: skyData.length }, (_, index) => index),
		units: () => Array.from({ length: unitData.length }, (_, index) => index),
		buildings: () => Array.from({ length: buildingData.length }, (_, index) => index),
	}

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

<grid class="p-0 h-screen max-h-screen overflow-hidden flex flex-col select-none md:p-6">
	<div class="hidden md:flex">
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
						style="margin-top: {-unitData[index].yOffset + 6}px"
					/>
				{:else}
					...
				{/if}
			</EditorButton>
		</ButtonGrid>
	</div>

	<div class="flex md:hidden">
		{#if editType !== 'ground'}
			<div class="flex-grow h-[84px] transition-all hover:h-[286px] focus:h-[286px]">
				<ButtonGrid cols={1} length={maxTeamAmount} let:index>
					<EditorButton action={changeTeam(index)} selected={team === index} {size}>
						{#if $contextLoaded}
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
		{/if}

		<ButtonGrid rows={1} length={unitData.length} let:index>
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
						style="margin-top: {-unitData[index].yOffset + 6}px"
					/>
				{:else}
					...
				{/if}
			</EditorButton>
		</ButtonGrid>
	</div>

	<div class="contents md:hidden">
		<ButtonGrid rows={1} length={terrainData.length} let:index>
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

	<div class="flex-1 flex overflow-hidden">
		<div class="hidden md:contents">
			<ButtonGrid cols={1} length={actions.length} let:index>
				<EditorButton action={actions[index].act} {size}>
					<Icon icon={actions[index].icon} width={size - 3} height={size - 33} />
					{actions[index].label}
				</EditorButton>
			</ButtonGrid>
		</div>

		<div class="shrink grow overflow-clip min-w-[300px]">
			<MapRender pause {map} {select} {contextLoaded} />
		</div>

		<div class="hidden md:contents">
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
	</div>

	<div class="contents md:hidden">
		<ButtonGrid rows={1} length={actions.length} let:index>
			<EditorButton action={actions[index].act} {size}>
				<Icon icon={actions[index].icon} width={size - 3} height={size - 33} />
				{actions[index].label}
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
