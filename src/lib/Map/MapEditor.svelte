<script lang="ts">
	import { writable } from 'svelte/store'
	import { addToast } from 'as-toast'
	import { goto } from '$app/navigation'
	import { Modal } from 'flowbite-svelte'
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
	import { renderMapThumbnail } from './Editor/mapThumbnail'
	import { skyData } from '$lib/GameData/sky'
	import { buildingData } from '$lib/GameData/building'
	import { parseCutsceneScript } from '$lib/Campaign/cutsceneScript'
	import { CutsceneParseError } from '$lib/Campaign/cutsceneTypes'
	import { NEUTRAL_TEAM } from '$lib/Engine/gameState'
	import { canPlaceUnit } from '$lib/Engine/Interactor/Pathing/movement'
	import { carriableUnitTypes, isTransportType } from '$lib/Engine/modifiers/transport'

	export let mapHash: string | undefined = undefined

	const maxTeamAmount = 4
	const size = 64
	const teamColors = ['rgb(233,56,46)', 'rgb(69,164,225)', 'rgb(67,193,56)', 'rgb(229,229,43)']
	const contextLoaded = writable(!!$rendererStore.ground[0]?.sprite)

	type Brush = 'ground' | 'units' | 'buildings' | 'sky'

	let openOptionsModal = false
	let openScriptModal = false
	let editType: Brush = 'ground'
	let unitType = 0
	let groundType = 0
	let buildingType = 0
	let skyType = 0
	let team = 0
	let erasing = false
	// True while a Share upload is in flight, so the toolbar can show a spinner
	// and we never fire a second overlapping upload from a double-click.
	let sharing = false
	// The passenger a placed transport carries (a unit type), or null for empty.
	// Persists across placements so several loaded transports drop without reselecting.
	let cargoType: number | null = null
	let map: MapObject = $mapStore ?? deriveFromHash(mapHash)

	/** Brushes that place a team-owned object (so the team picker is shown). */
	const teamedBrush = (brush: Brush) => brush === 'units' || brush === 'buildings'

	map.filters = {
		ground: () => Array.from({ length: terrainData.length }, (_, index) => index),
		sky: () => Array.from({ length: skyData.length }, (_, index) => index),
		units: () => Array.from({ length: unitData.length }, (_, index) => index),
		buildings: () => Array.from({ length: buildingData.length }, (_, index) => index),
	}

	$: type =
		editType === 'units'
			? unitType
			: editType === 'buildings'
				? buildingType
				: editType === 'sky'
					? skyType
					: groundType
	$: activeUnit = unitData[unitType]
	$: activeTerrain = terrainData[groundType]
	$: activeBuilding = buildingData[buildingType]
	$: activeSky = skyData[skyType]

	$: scriptError = (() => {
		if (!map.script || map.script.trim() === '') return null
		try {
			parseCutsceneScript(map.script)
			return null
		} catch (e) {
			if (e instanceof CutsceneParseError) return { line: e.line, message: e.message }
			return { line: 0, message: e instanceof Error ? e.message : 'Unknown error' }
		}
	})()

	$: playerTeams = (() => {
		const teams = new Set<number>()
		for (const u of map.layers.units) if (u && typeof u.team === 'number') teams.add(u.team)
		// Neutral buildings belong to nobody, so they don't count toward playable teams.
		for (const b of map.layers.buildings)
			if (b && typeof b.team === 'number' && b.team !== NEUTRAL_TEAM) teams.add(b.team)
		return teams
	})()
	$: canPlay = playerTeams.size >= 2

	// Units always belong to a player; never leave the brush on Neutral when it
	// would place a team-4 unit (which has no player and would render grey).
	$: if (editType === 'units' && team === NEUTRAL_TEAM) team = 0

	// Passenger options for the currently-selected unit — only transports can carry,
	// and only the types each transport legally accepts. Drop a stale cargo choice
	// when switching to a unit that can't carry it (or can't carry at all).
	$: carriable = editType === 'units' && isTransportType(unitType) ? carriableUnitTypes(unitType) : []
	$: if (cargoType !== null && !carriable.includes(cargoType)) cargoType = null

	const select = (x: number, y: number) => {
		const tile = y * map.cols + x
		if (erasing) {
			if (editType === 'units') map.layers.units[tile] = null
			else if (editType === 'buildings') map.layers.buildings[tile] = null
			else if (editType === 'sky') map.layers.sky[tile] = null
			else map.layers.ground[tile] = { type: 0, state: 0 }
			return
		}
		if (editType === 'units') {
			// A unit can only be placed where it could legally stand: ground units off
			// the sea, ships off the land, nothing on a volcano, tanks off mountains, etc.
			const ground = map.layers.ground[tile]
			if (!ground) return
			if (!canPlaceUnit(ground, { type, team, state: 4 }, map.layers.sky[tile])) return
			// A transport carries its chosen passenger (same team), authored inline so it
			// plays loaded; an empty transport (or any other unit) places as before.
			const rescuedUnit =
				isTransportType(type) && cargoType !== null
					? { type: cargoType, team, state: 4 }
					: undefined
			map.layers.units[tile] = { type, team, state: 4, rescuedUnit }
		} else if (editType === 'buildings') {
			// Sea buildings only belong on ocean terrain, ground buildings only on land.
			const terrain = terrainData[map.layers.ground[tile]?.type ?? 0]
			if (buildingData[type].ocean !== terrain.ocean) return
			map.layers.buildings[tile] = { type, team, state: 0 }
		} else if (editType === 'sky') {
			map.layers.sky[tile] = { type, state: 0 }
		} else {
			map.layers.ground[tile] = { type, state: 0 }
		}
	}

	const setBrush = (brush: Brush) => () => {
		editType = brush
		erasing = false
	}
	const changeType = (selectedType: Brush, index: number) => () => {
		editType = selectedType
		if (selectedType === 'units') unitType = index
		else if (selectedType === 'buildings') buildingType = index
		else if (selectedType === 'sky') skyType = index
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
	const shareMap = async () => {
		if (sharing) return
		sharing = true
		try {
			// A published map must carry a thumbnail for the /make listing, so block
			// the upload until the board can actually be snapshotted (sprites loaded
			// and the canvas exportable) rather than publishing a thumbnail-less row.
			const thumbnail = renderMapThumbnail(map)
			if (!thumbnail) {
				addToast('Map preview is still loading — try sharing again in a moment.', 'warn')
				return
			}
			await share(map?.title ?? 'ThunderLite Online', mapHasher(map), thumbnail)
		} finally {
			sharing = false
		}
	}
	const playMap = async () => {
		if (!canPlay) return
		const sha = mapHasher(map)
		mapStore.set(map)
		playMapStore.set(deriveFromHash(sha))
		// Editor "Play" is always a local test of the in-progress map, which may
		// not be saved to the backend yet. Go straight to ephemeral play instead
		// of creating a backend room (which 400s for unregistered map hashes).
		await goto(`/play?ephemeral=1&sha=${encodeURIComponent(sha)}`)
	}

	const tools = [
		{ label: 'Open', icon: 'fluent:folder-32-filled', act: openMap },
		{ label: 'Save', icon: 'fluent:save-24-filled', act: saveMap },
		{ label: 'Share', icon: 'gg:share', act: shareMap },
	]

	const scriptReference = [
		'talk Speaker: "line one", "line two"',
		'move: x,y                  - pan camera',
		'hl: x,y   /  unhl: x,y     - (un)highlight tile',
		'wait: seconds',
		'add unit: team,"Name",x,y',
		'kill unit: x,y',
		'add building: team,"Name",x,y',
		'remove building: x,y',
		'own building: team,x,y',
		'terrain: "Name",x,y',
		'weather: "Name",x,y',
		'clear weather: x,y',
		'fog: on  /  fog: off',
		'funds: team,amount         - amount may be negative',
	]

	$: mapStore.set(map)
</script>

<div class="flex h-full min-h-0 flex-col bg-background text-foreground select-none">
	<!-- Toolbar -->
	<header
		class="z-10 flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2"
	>
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
				{@const busy = tool.label === 'Share' && sharing}
				<button
					type="button"
					on:click={tool.act}
					disabled={busy}
					aria-busy={busy}
					title={tool.label}
					class="btn btn-ghost btn-sm"
					class:opacity-60={busy}
					class:cursor-wait={busy}
				>
					<Icon
						icon={busy ? 'mdi:loading' : tool.icon}
						width="16"
						height="16"
						class={busy ? 'animate-spin' : ''}
					/>
					<span class="hidden lg:inline">{busy ? 'Sharing…' : tool.label}</span>
				</button>
			{/each}
			<button
				type="button"
				on:click={() => (openScriptModal = true)}
				title="Edit map script"
				class="btn btn-ghost btn-sm"
				class:text-destructive={scriptError}
			>
				<Icon icon="mdi:script-text-outline" width="16" height="16" />
				<span class="hidden lg:inline">Script</span>
				{#if scriptError}
					<span class="h-1.5 w-1.5 rounded-full bg-destructive"></span>
				{/if}
			</button>
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
			<button
				type="button"
				on:click={playMap}
				disabled={!canPlay}
				title={canPlay ? 'Play' : 'Add units or buildings for at least 2 players to play'}
				aria-disabled={!canPlay}
				class="btn btn-primary btn-sm"
				class:cursor-not-allowed={!canPlay}
				class:opacity-50={!canPlay}
			>
				<Icon icon="solar:play-bold" width="15" height="15" />
				Play
			</button>
		</div>
	</header>

	{#if erasing}
		<div
			class="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm text-destructive"
		>
			<Icon icon="mdi:eraser" width="15" height="15" />
			Eraser active. Click tiles to {editType === 'units'
				? 'remove units'
				: editType === 'buildings'
					? 'remove buildings'
					: editType === 'sky'
						? 'clear weather'
						: 'reset to plains'}.
		</div>
	{/if}

	{#if !canPlay}
		<div
			class="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-700"
		>
			<Icon icon="mdi:alert" width="15" height="15" />
			Place units or buildings for at least 2 players before you can play.
		</div>
	{/if}

	<!-- Body -->
	<div class="flex min-h-0 flex-1">
		<aside class="hidden w-80 shrink-0 flex-col border-r border-border bg-surface md:flex">
			{@render paletteHeader()}
			<div class="min-h-0 flex-1 overflow-y-auto">
				<div class="flex flex-wrap content-start gap-2 p-3">
					{@render tiles()}
				</div>
			</div>
			{@render cargoPicker()}
			{@render brushInfo()}
		</aside>

		<div class="relative min-w-0 flex-1 overflow-hidden">
			<MapRender pause editor {map} {select} {contextLoaded} backdrop="bg-surface-2 grid-pattern" />
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
		{@render cargoPicker()}
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

<Modal title="Map script" bind:open={openScriptModal} outsideclose size="xl">
	<section class="flex flex-col gap-3">
		<p class="text-sm text-muted-foreground">
			Author cutscene-style logic that runs while this map is played: dialogue, camera moves,
			spawns, weather, funds, victory/defeat, and more. Blocks fire on level load
			(<code>&lt;start&gt;</code>), each side-turn (<code>&lt;turn N,T&gt;</code>), and match end
			(<code>&lt;win&gt;</code> / <code>&lt;lose&gt;</code>).
		</p>

		<textarea
			bind:value={map.script}
			spellcheck="false"
			placeholder={'<start>\n  move: 4,4\n  talk Commander: "Hold the line!"\n</start>'}
			rows="16"
			class="input w-full resize-y font-mono text-sm leading-relaxed"
			aria-label="Map script"
		></textarea>

		{#if scriptError}
			<div
				class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
			>
				<Icon icon="mdi:alert-circle" width="16" height="16" class="mt-0.5 shrink-0" />
				<span>
					{#if scriptError.line > 0}<strong>Line {scriptError.line}:</strong> {/if}{scriptError.message}
				</span>
			</div>
		{:else if map.script && map.script.trim() !== ''}
			<div class="flex items-center gap-2 text-sm text-emerald-600">
				<Icon icon="mdi:check-circle" width="16" height="16" />
				Script parses cleanly.
			</div>
		{/if}

		<details class="rounded-md border border-border bg-surface-2/50 p-3 text-sm">
			<summary class="cursor-pointer font-semibold">Command reference</summary>
			<div class="mt-2 grid gap-1 font-mono text-xs text-muted-foreground">
				{#each scriptReference as line (line)}
					<div>{line}</div>
				{/each}
			</div>
			<p class="mt-2 text-xs text-muted-foreground">
				Full reference: <code>docs/map-scripting.md</code>
			</p>
		</details>
	</section>

	{#snippet footer()}
		<button type="button" on:click={() => (openScriptModal = false)} class="btn btn-primary ml-auto">
			<Icon icon="mdi:check" width="16" height="16" />
			Done
		</button>
	{/snippet}
</Modal>

{#snippet brushTab(brush: Brush, icon: string, label: string)}
	<button
		type="button"
		on:click={setBrush(brush)}
		class="flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
		class:bg-surface={editType === brush}
		class:text-foreground={editType === brush}
		class:shadow-sm={editType === brush}
		class:text-muted-foreground={editType !== brush}
	>
		<Icon {icon} width="16" height="16" />
		{label}
	</button>
{/snippet}

{#snippet paletteHeader()}
	<div class="flex flex-col gap-2 border-b border-border p-3">
		<div class="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
			{@render brushTab('ground', 'mdi:grass', 'Terrain')}
			{@render brushTab('units', 'mdi:tank', 'Units')}
			{@render brushTab('buildings', 'mdi:office-building', 'Buildings')}
			{@render brushTab('sky', 'mdi:weather-partly-cloudy', 'Weather')}
		</div>

		<div class="flex items-center gap-2">
			{#if teamedBrush(editType)}
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
					{#if editType === 'buildings'}
						<button
							type="button"
							on:click={changeTeam(NEUTRAL_TEAM)}
							title="Neutral (unclaimed, capturable)"
							aria-pressed={team === NEUTRAL_TEAM}
							class="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-all"
							class:border-primary={team === NEUTRAL_TEAM}
							class:bg-accent={team === NEUTRAL_TEAM}
							class:text-accent-foreground={team === NEUTRAL_TEAM}
							class:border-border={team !== NEUTRAL_TEAM}
							class:text-muted-foreground={team !== NEUTRAL_TEAM}
							class:hover:bg-muted={team !== NEUTRAL_TEAM}
						>
							<span class="h-3 w-3 rounded-full bg-neutral-400 ring-1 ring-black/10"></span>
							Neutral
						</button>
					{/if}
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
	{:else if editType === 'buildings'}
		{#each buildingData as building, i (building.name + i)}
			<EditorButton
				action={changeType('buildings', i)}
				selected={!erasing && editType === 'buildings' && buildingType === i}
				title={building.name}
				{size}
			>
				{@render buildingImg(i, team)}
			</EditorButton>
		{/each}
	{:else if editType === 'sky'}
		{#each skyData as sky, i (sky.name + i)}
			<EditorButton
				action={changeType('sky', i)}
				selected={!erasing && editType === 'sky' && skyType === i}
				title={sky.name}
				{size}
			>
				{@render skyImg(i)}
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

<!-- Cargo picker: surfaces only when the selected unit is a transport, letting the
     author choose what it carries (or leave it empty). The choice sticks across map
     clicks so a loadout can be stamped down repeatedly without reselecting. -->
{#snippet cargoPicker()}
	{#if !erasing && carriable.length > 0}
		<div class="flex flex-col gap-2 border-t border-border bg-surface-2/50 p-3">
			<div class="flex items-baseline justify-between gap-2">
				<span class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Carrying
				</span>
				<span class="truncate text-xs text-muted-foreground">
					{cargoType === null ? 'Empty' : unitData[cargoType].name}
				</span>
			</div>
			<div class="flex flex-wrap gap-2">
				<EditorButton
					action={() => (cargoType = null)}
					selected={cargoType === null}
					title="Empty (no passenger)"
					size={48}
				>
					<div class="flex h-full w-full items-center justify-center text-muted-foreground">
						<Icon icon="mdi:close" width="18" height="18" />
					</div>
				</EditorButton>
				{#each carriable as c (c)}
					<EditorButton
						action={() => (cargoType = c)}
						selected={cargoType === c}
						title={unitData[c].name}
						size={48}
					>
						{@render unitImg(c, team)}
					</EditorButton>
				{/each}
			</div>
		</div>
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
		style="margin: {-terrainData[tType].yOffset}px {-terrainData[tType].xOffset}px 0 {-(terrainData[tType]
			.editorState ?? 0) * 60}px;"
	/>
{/snippet}

{#snippet buildingImg(bType: number, bTeam: number)}
	{#if $contextLoaded && $spriteStore['buildings'][bType]?.[bTeam]}
		<img
			class="pointer-events-none min-w-fit object-cover"
			src={$spriteStore['buildings'][bType][bTeam].src}
			alt={buildingData[bType].name}
			style="margin: {-buildingData[bType].yOffset + 6}px {-buildingData[bType].xOffset}px 0 0;"
		/>
	{:else}
		<img
			class="pointer-events-none min-w-fit object-cover object-top-left"
			src={buildingData[bType].url}
			alt={buildingData[bType].name}
			style="margin: {-buildingData[bType].yOffset}px {-buildingData[bType].xOffset}px 0 0;"
		/>
	{/if}
{/snippet}

{#snippet skyImg(sType: number)}
	<img
		class="pointer-events-none min-w-fit object-cover object-top-left"
		src={skyData[sType].url}
		alt={skyData[sType].name}
		style="margin: {-skyData[sType].yOffset}px {-skyData[sType].xOffset}px 0 0;"
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
						Click tiles to {editType === 'units'
							? 'remove units'
							: editType === 'buildings'
								? 'remove buildings'
								: editType === 'sky'
									? 'clear weather'
									: 'reset to plains'}
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
		{:else if editType === 'buildings'}
			<div class="mb-1 font-semibold">{activeBuilding.name}</div>
			<p class="mb-2 text-xs text-muted-foreground">{activeBuilding.description}</p>
			<div class="flex flex-wrap gap-1.5">
				{@render stat('DEF', activeBuilding.protection)}
				{@render stat('HP', activeBuilding.stature)}
				{#if activeBuilding.income > 0}
					{@render stat('Income', activeBuilding.income)}
				{/if}
			</div>
		{:else if editType === 'sky'}
			<div class="mb-1 font-semibold">{activeSky.name}</div>
			<p class="mb-2 text-xs text-muted-foreground">{activeSky.description}</p>
			<div class="flex flex-wrap gap-1.5">
				{@render stat('DEF', activeSky.protection)}
				{@render stat('Drag', activeSky.drag)}
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
