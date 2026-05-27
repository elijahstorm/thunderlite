<script lang="ts">
	import { writable } from 'svelte/store'
	import { goto } from '$app/navigation'
	import MapRender from './MapRender.svelte'
	import Icon from '@iconify/svelte'
	import EditorButton from './Editor/EditorButton.svelte'
	import MapOptions from './MapOptions.svelte'
	import { terrainData } from '$lib/GameData/terrain'
	import { unitData } from '$lib/GameData/unit'
	import { mapStore, playMapStore } from './mapStore'
	import { rendererStore, spriteStore } from '$lib/Sprites/spriteStore'
	import { open, save } from './Editor/fileManager'
	import { deriveFromHash, mapHasher } from './Editor/mapExporter'
	import { share } from './Editor/mapShare'
	import { skyData } from '$lib/GameData/sky'
	import { buildingData } from '$lib/GameData/building'

	export let mapHash: string | undefined = undefined

	const maxTeamAmount = 4
	const size = 64
	const teamColors = ['rgb(233,56,46)', 'rgb(69,164,225)', 'rgb(67,193,56)', 'rgb(229,229,43)']
	const contextLoaded = writable(!!$rendererStore.ground[0]?.sprite)

	let openOptionsModal = false
	let editType: 'units' | 'ground' = 'ground'
	let unitType = 0
	let groundType = 0
	let team = 0
	let erasing = false
	let map: MapObject = $mapStore ?? deriveFromHash(mapHash)

	map.filters = {
		ground: () => Array.from({ length: terrainData.length }, (_, index) => index),
		sky: () => Array.from({ length: skyData.length }, (_, index) => index),
		units: () => Array.from({ length: unitData.length }, (_, index) => index),
		buildings: () => Array.from({ length: buildingData.length }, (_, index) => index),
	}

	$: type = editType === 'units' ? unitType : groundType
	$: activeUnit = unitData[unitType]
	$: activeTerrain = terrainData[groundType]

	const select = (x: number, y: number) => {
		const tile = y * map.cols + x
		if (erasing) {
			if (editType === 'units') delete map.layers.units[tile]
			else map.layers.ground[tile] = { type: 0, state: 0 }
			return
		}
		if (editType === 'units') {
			map.layers.units[tile] = { type, team, state: 4 }
		} else {
			map.layers.ground[tile] = { type, state: 0 }
		}
	}

	const setBrush = (brush: 'units' | 'ground') => () => {
		editType = brush
		erasing = false
	}
	const changeType = (selectedType: 'units' | 'ground', index: number) => () => {
		editType = selectedType
		if (selectedType === 'units') unitType = index
		else groundType = index
		erasing = false
	}
	const changeTeam = (index: number) => () => (team = index)
	const toggleErase = () => (erasing = !erasing)

	const saveMap = () => save(mapHasher(map))
	const openMap = () =>
		open((content: string | null) => {
			if (content) map = deriveFromHash(content)
		})
	const shareMap = () => share(map?.title ?? 'ThunderLite Online', mapHasher(map))
	const playMap = async () => {
		const sha = mapHasher(map)
		mapStore.set(map)
		playMapStore.set(deriveFromHash(sha))
		let ok = false
		try {
			const response = await fetch('/api/game', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sha }),
			})
			ok = response.ok
		} catch {
			ok = false
		}
		await goto(ok ? '/play' : `/play?ephemeral=1&sha=${encodeURIComponent(sha)}`)
	}

	const tools = [
		{ label: 'Open', icon: 'fluent:folder-32-filled', act: openMap },
		{ label: 'Save', icon: 'fluent:save-24-filled', act: saveMap },
		{ label: 'Share', icon: 'gg:share', act: shareMap },
	]

	$: mapStore.set(map)
</script>

<div class="flex h-full min-h-0 flex-col bg-background text-foreground select-none">
	<!-- Toolbar -->
	<header class="z-10 flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<span
				class="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground sm:inline-flex"
			>
				<Icon icon="mdi:map-marker-path" width="18" height="18" />
			</span>
			<input
				bind:value={map.title}
				spellcheck="false"
				placeholder="Untitled map"
				aria-label="Map title"
				class="min-w-0 max-w-[16rem] flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold tracking-tight outline-none transition-colors select-text hover:border-border focus:border-ring focus:bg-surface"
			/>
			<button
				type="button"
				on:click={() => (openOptionsModal = true)}
				title="Resize map"
				class="chip shrink-0 transition-colors hover:bg-surface-3"
			>
				<Icon icon="mdi:resize" width="13" height="13" />
				{map.cols} × {map.rows}
			</button>
		</div>

		<div class="flex items-center gap-1">
			{#each tools as tool (tool.label)}
				<button type="button" on:click={tool.act} title={tool.label} class="btn btn-ghost btn-sm">
					<Icon icon={tool.icon} width="16" height="16" />
					<span class="hidden lg:inline">{tool.label}</span>
				</button>
			{/each}
			<button
				type="button"
				on:click={() => (openOptionsModal = true)}
				title="Map options"
				class="btn btn-ghost btn-sm"
			>
				<Icon icon="gis:map-options" width="16" height="16" />
				<span class="hidden lg:inline">Options</span>
			</button>
			<div class="mx-1 h-5 w-px bg-border"></div>
			<button type="button" on:click={playMap} class="btn btn-primary btn-sm">
				<Icon icon="solar:play-bold" width="15" height="15" />
				Play
			</button>
		</div>
	</header>

	<!-- Body -->
	<div class="flex min-h-0 flex-1">
		<aside class="hidden w-80 shrink-0 flex-col border-r border-border bg-surface md:flex">
			{@render paletteHeader()}
			<div class="min-h-0 flex-1 overflow-y-auto">
				<div class="flex flex-wrap content-start gap-2 p-3">
					{@render tiles()}
				</div>
			</div>
			{@render brushInfo()}
		</aside>

		<div class="relative min-w-0 flex-1 overflow-hidden">
			<MapRender pause {map} {select} {contextLoaded} backdrop="bg-surface-2 grid-pattern" />
			{#if erasing}
				<div class="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
					<span class="chip border-destructive/40 bg-destructive/10 text-destructive">
						<Icon icon="mdi:eraser" width="13" height="13" /> Eraser active
					</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Mobile dock -->
	<div class="border-t border-border bg-surface md:hidden">
		{@render paletteHeader()}
		<div class="overflow-x-auto">
			<div class="flex gap-2 p-3">
				{@render tiles()}
			</div>
		</div>
	</div>
</div>

<MapOptions
	{map}
	bind:open={openOptionsModal}
	apply={(appliedChanges) => (map = appliedChanges)}
	let:updatedMap
>
	<MapRender pause mini map={updatedMap} select={() => {}} backdrop="bg-surface-2" />
</MapOptions>

{#snippet paletteHeader()}
	<div class="flex flex-col gap-2 border-b border-border p-3">
		<div class="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
			<button
				type="button"
				on:click={setBrush('ground')}
				class="flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
				class:bg-surface={editType === 'ground'}
				class:text-foreground={editType === 'ground'}
				class:shadow-sm={editType === 'ground'}
				class:text-muted-foreground={editType !== 'ground'}
			>
				<Icon icon="mdi:grass" width="16" height="16" />
				Terrain
			</button>
			<button
				type="button"
				on:click={setBrush('units')}
				class="flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
				class:bg-surface={editType === 'units'}
				class:text-foreground={editType === 'units'}
				class:shadow-sm={editType === 'units'}
				class:text-muted-foreground={editType !== 'units'}
			>
				<Icon icon="mdi:tank" width="16" height="16" />
				Units
			</button>
		</div>

		<div class="flex items-center gap-2">
			{#if editType === 'units'}
				<div class="flex flex-wrap items-center gap-1" role="group" aria-label="Team">
					{#each Array.from({ length: maxTeamAmount }) as _, i}
						<button
							type="button"
							on:click={changeTeam(i)}
							title={`Player ${i + 1}`}
							aria-pressed={team === i}
							class="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-all"
							class:border-primary={team === i}
							class:bg-accent={team === i}
							class:text-accent-foreground={team === i}
							class:border-border={team !== i}
							class:text-muted-foreground={team !== i}
							class:hover:bg-muted={team !== i}
						>
							<span
								class="h-3 w-3 rounded-full ring-1 ring-black/10"
								style="background: {teamColors[i]}"
							></span>
							P{i + 1}
						</button>
					{/each}
				</div>
			{/if}
			<button
				type="button"
				on:click={toggleErase}
				title="Toggle eraser"
				aria-pressed={erasing}
				class="btn btn-sm ml-auto shrink-0"
				class:btn-destructive={erasing}
				class:btn-outline={!erasing}
			>
				<Icon icon="mdi:eraser" width="15" height="15" />
				Erase
			</button>
		</div>
	</div>
{/snippet}

{#snippet tiles()}
	{#if editType === 'units'}
		{#each unitData as unit, i (unit.name + i)}
			<EditorButton
				action={changeType('units', i)}
				selected={!erasing && editType === 'units' && unitType === i}
				title={unit.name}
				{size}
			>
				{@render unitImg(i, team)}
			</EditorButton>
		{/each}
	{:else}
		{#each terrainData as terrain, i (terrain.name + i)}
			<EditorButton
				action={changeType('ground', i)}
				selected={!erasing && editType === 'ground' && groundType === i}
				title={terrain.name}
				{size}
			>
				{@render terrainImg(i)}
			</EditorButton>
		{/each}
	{/if}
{/snippet}

{#snippet unitImg(uType: number, uTeam: number)}
	{#if $contextLoaded}
		<img
			class="pointer-events-none min-w-fit object-cover"
			src={$spriteStore['units'][uType][uTeam].src}
			alt={unitData[uType].name}
			style="margin: {-unitData[uType].yOffset + 6}px {-unitData[uType].xOffset}px 0 0;"
		/>
	{:else}
		<div class="h-full w-full animate-pulse bg-surface-3"></div>
	{/if}
{/snippet}

{#snippet terrainImg(tType: number)}
	<img
		class="pointer-events-none min-w-fit object-cover object-top-left"
		src={terrainData[tType].url}
		alt={terrainData[tType].name}
		style="margin: {-terrainData[tType].yOffset}px {-terrainData[tType].xOffset}px 0 0;"
	/>
{/snippet}

{#snippet stat(label: string, value: string | number)}
	<span class="chip gap-1">
		<span class="text-[10px] tracking-wide uppercase opacity-70">{label}</span>
		<span class="text-foreground">{value}</span>
	</span>
{/snippet}

{#snippet brushInfo()}
	<div class="border-t border-border bg-surface-2/50 p-3">
		{#if erasing}
			<div class="flex items-center gap-2 text-sm">
				<span
					class="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/10 text-destructive"
				>
					<Icon icon="mdi:eraser" width="16" height="16" />
				</span>
				<div>
					<div class="font-semibold">Eraser</div>
					<div class="text-xs text-muted-foreground">
						Click tiles to {editType === 'units' ? 'remove units' : 'reset to plains'}
					</div>
				</div>
			</div>
		{:else if editType === 'units'}
			<div class="mb-2 flex items-baseline justify-between gap-2">
				<span class="truncate font-semibold">{activeUnit.name}</span>
				<span class="shrink-0 text-xs tracking-wide text-muted-foreground uppercase">
					{activeUnit.type}
				</span>
			</div>
			<div class="flex flex-wrap gap-1.5">
				{@render stat('ATK', activeUnit.power)}
				{@render stat('HP', activeUnit.health)}
				{@render stat('MOV', activeUnit.movement)}
				{@render stat('Cost', activeUnit.cost)}
			</div>
		{:else}
			<div class="mb-1 font-semibold">{activeTerrain.name}</div>
			<p class="mb-2 text-xs text-muted-foreground">{activeTerrain.description}</p>
			<div class="flex flex-wrap gap-1.5">
				{@render stat('DEF', activeTerrain.protection)}
				{@render stat('Ground', activeTerrain.details)}
			</div>
		{/if}
	</div>
{/snippet}
