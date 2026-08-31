<script lang="ts">
	import { writable } from 'svelte/store'
	import { onMount, untrack } from 'svelte'
	import { addToast } from 'as-toast'
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'
	import { Modal } from 'flowbite-svelte'
	import MapRender from './MapRender.svelte'
	import Icon from '@iconify/svelte'
	import EditorButton from './Editor/EditorButton.svelte'
	import MapOptions from './MapOptions.svelte'
	import MapThumbnail from '$lib/Components/Widgets/Social/MapThumbnail.svelte'
	import { terrainData } from '$lib/GameData/terrain'
	import { unitData } from '$lib/GameData/unit'
	import { activeMapIdStore, mapStore, playMapStore } from './mapStore'
	import { canResumeInMemoryMap } from './mapContent'
	import { rendererStore, spriteStore } from '$lib/Sprites/spriteStore'
	import { deriveFromHash, deriveFromData, exportMapData } from './Editor/mapExporter'
	import { mapHasherAsync } from './Editor/mapHashAsync'
	import {
		clearDraft,
		clearLastActiveMapId,
		getLastActiveMapId,
		loadDraft,
		saveDraft,
	} from './Editor/editorDraft'
	import { publishMap, shareLink } from './Editor/mapShare'
	import { deleteMap } from './Editor/mapDelete'
	import { renderMapThumbnail } from './Editor/mapThumbnail'
	import { skyData } from '$lib/GameData/sky'
	import { buildingData } from '$lib/GameData/building'
	import { parseCutsceneScript } from '$lib/Campaign/cutsceneScript'
	import { CutsceneParseError } from '$lib/Campaign/cutsceneTypes'
	import { NEUTRAL_TEAM } from '$lib/Engine/gameState'
	import { canPlaceUnit } from '$lib/Engine/Interactor/Pathing/movement'
	import { carriableUnitTypes, isTransportType } from '$lib/Engine/modifiers/transport'
	import { repaintSignal } from '$lib/Engine/Animator/animator'

	// The map's `public_id` when editing an existing, saved map. Save/Share write
	// back to this row (mutable maps), so the shareable link stays stable across

	interface Props {
		mapHash?: string | undefined
		// edits. New maps start undefined and adopt the id their first save mints.
		mapId?: string | undefined
		// The saved map's display name (`maps.name`). The compact hash omits the
		// title (see mapExporter#filter), so it rides in separately.
		mapName?: string | undefined
	}

	let { mapHash = undefined, mapId = undefined, mapName = undefined }: Props = $props()

	const maxTeamAmount = 4
	const size = 64
	const teamColors = ['rgb(233,56,46)', 'rgb(69,164,225)', 'rgb(67,193,56)', 'rgb(229,229,43)']
	const contextLoaded = writable(!!$rendererStore.ground[0]?.sprite)

	type Brush = 'ground' | 'units' | 'buildings' | 'sky'

	let openOptionsModal = $state(false)
	let openScriptModal = $state(false)
	// The Load picker: lists the signed-in user's saved maps so they can switch
	// which map the editor is working on without leaving for /my/maps first.
	let openLoadModal = $state(false)
	let myMaps: MapDBData[] = $state([])
	let loadingMaps = $state(false)
	let loadError = $state('')
	// Deleting a map from the Load picker: `deleteTarget` is the row awaiting
	// the user's confirmation in the Delete modal.
	let deleteTarget: MapDBData | null = $state(null)
	let confirmDeleteOpen = $state(false)
	let deletingMap = $state(false)
	let editType = $state<Brush>('ground')
	let unitType = $state(0)
	let groundType = $state(0)
	let buildingType = $state(0)
	let skyType = $state(0)
	let team = $state(0)
	let erasing = $state(false)
	// True while a Save/Share upload is in flight, so the toolbar can show a
	// spinner and we never fire a second overlapping upload from a double-click.
	let saving = $state(false)
	let sharing = $state(false)
	// The custom "you're about to overwrite a saved map" confirmation. `resolveOverwrite`
	// is the pending promise resolver the modal's buttons call.
	let confirmOverwriteOpen = $state(false)
	let resolveOverwrite: ((ok: boolean) => void) | null = null
	// Whether the in-memory board belongs to THIS editing context, and may therefore
	// be resumed instead of re-deriving from the route's hash. See `mapContent` for
	// why an unconditional resume silently overwrote saved maps.
	const resumable = untrack(() =>
		canResumeInMemoryMap({
			hasStoredMap: $mapStore != null,
			routeMapId: mapId,
			storedMapId: $activeMapIdStore,
		})
	)
	// The saved map's id, adopted on first save so later saves update in place.
	// On a bare-route remount that resumed the in-memory board (e.g. bounced back
	// from Play, or reopened /editor), re-adopt the id that board was linked to so
	// a save updates the same row instead of forking a duplicate.
	let currentMapId: string | undefined = $state(
		untrack(() => mapId ?? (resumable ? $activeMapIdStore : undefined))
	)
	// The passenger a placed transport carries (a unit type), or null for empty.
	// Persists across placements so several loaded transports drop without reselecting.
	let cargoType: number | null = $state(null)
	let map: MapObject = $state.raw(
		untrack(() => {
			const initial = resumable ? ($mapStore as MapObject) : deriveFromHash(mapHash)
			// A board freshly derived from a saved map's hash has no title (the hash
			// omits it), so adopt the DB name; a resumed in-memory board keeps its own.
			if (!resumable && mapName) initial.title = mapName
			return initial
		})
	)
	// Whether we arrived here mid-session with a live draft still in memory (e.g.
	// bounced back from the Play page). That in-memory map is always the freshest
	// copy, so we must never clobber it with a (possibly older) localStorage
	// recovery — only a genuinely fresh load (reload / crash) triggers recovery.
	const resumedFromMemory = resumable

	/** Brushes that place a team-owned object (so the team picker is shown). */
	const teamedBrush = (brush: Brush) => brush === 'units' || brush === 'buildings'

	// The editor shows every palette entry, so its filters return the full index
	// range (unlike a played map, which filters to placed types). Reapplied after
	// any `map` reassignment (recovery / new / resize) since those come from the
	// exporter, whose default filters would hide unplaced palette entries.
	const applyEditorFilters = (target: MapObject) => {
		target.filters = {
			ground: () => Array.from({ length: terrainData.length }, (_, index) => index),
			sky: () => Array.from({ length: skyData.length }, (_, index) => index),
			units: () => Array.from({ length: unitData.length }, (_, index) => index),
			buildings: () => Array.from({ length: buildingData.length }, (_, index) => index),
		}
		return target
	}
	untrack(() => applyEditorFilters(map))

	// A brand-new empty board with its own fresh layer arrays. `deriveFromHash()`
	// alone would share the module-level empty template's arrays, so a second new
	// map in the same session would inherit the first's edits — round-trip through
	// the hash to guarantee independent arrays.
	const freshEmptyMap = () =>
		applyEditorFilters(deriveFromData(JSON.parse(exportMapData(deriveFromHash(undefined)))))

	let type = $derived(
		editType === 'units'
			? unitType
			: editType === 'buildings'
				? buildingType
				: editType === 'sky'
					? skyType
					: groundType
	)
	let activeUnit = $derived(unitData[unitType])
	let activeTerrain = $derived(terrainData[groundType])
	let activeBuilding = $derived(buildingData[buildingType])
	let activeSky = $derived(skyData[skyType])

	let scriptError = $derived(
		(() => {
			if (!map.script || map.script.trim() === '') return null
			try {
				parseCutsceneScript(map.script)
				return null
			} catch (e) {
				if (e instanceof CutsceneParseError) return { line: e.line, message: e.message }
				return { line: 0, message: e instanceof Error ? e.message : 'Unknown error' }
			}
		})()
	)

	let playerTeams = $derived(
		(() => {
			const teams = new Set<number>()
			for (const u of map.layers.units) if (u && typeof u.team === 'number') teams.add(u.team)
			// Neutral buildings belong to nobody, so they don't count toward playable teams.
			for (const b of map.layers.buildings)
				if (b && typeof b.team === 'number' && b.team !== NEUTRAL_TEAM) teams.add(b.team)
			return teams
		})()
	)
	let canPlay = $derived(playerTeams.size >= 2)

	// Units always belong to a player; never leave the brush on Neutral when it
	// would place a team-4 unit (which has no player and would render grey).
	$effect(() => {
		if (editType === 'units' && team === NEUTRAL_TEAM) team = 0
	})

	// Passenger options for the currently-selected unit — only transports can carry,
	// and only the types each transport legally accepts. Drop a stale cargo choice
	// when switching to a unit that can't carry it (or can't carry at all).
	let carriable = $derived(
		editType === 'units' && isTransportType(unitType) ? carriableUnitTypes(unitType) : []
	)
	$effect(() => {
		if (cargoType !== null && !carriable.includes(cargoType)) cargoType = null
	})

	// `map` is `$state.raw` (a plain object, not a deep proxy — the engine and this
	// editor mutate `map.layers` in place, and it get structuredClone'd on save, both of
	// which break on a proxy). Raw state only reacts to reassignment, and legacy relied
	// on Svelte 3/4 member-assignment reactivity (`map.x = y` → repaint) which runes
	// doesn't have. We must NOT reassign `map` for a paint: that changes the prop
	// identity flowing into MapRender→Game→TileSelector→Scroller, which desyncs the
	// Scroller's mount-time render closures and freezes further clicks after one edit.
	// Instead bump `repaintSignal` — the same store MapRender's autotile pass listens to
	// — so the board repaints in place from the (mutated) `map.layers`, and tick an
	// edit counter the autosave effect watches. (Reassignment stays for genuine identity
	// changes: resize apply / recovered draft — those remount the renderer via the
	// `{#key map}` below, which is what makes the swapped-in board actually visible.)
	let editVersion = $state(0)
	const commitEdit = () => {
		editVersion++
		repaintSignal.update((n) => n + 1)
	}

	const select = (x: number, y: number) => {
		const tile = y * map.cols + x
		if (erasing) {
			if (editType === 'units') map.layers.units[tile] = null
			else if (editType === 'buildings') map.layers.buildings[tile] = null
			else if (editType === 'sky') map.layers.sky[tile] = null
			else map.layers.ground[tile] = { type: 0, state: 0 }
			commitEdit()
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
		commitEdit()
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

	// Persist the current map to the user's library (DB-backed — no local files).
	// A published map must carry a thumbnail for the /make listing, so block the
	// upload until the board can actually be snapshotted (sprites loaded and the
	// canvas exportable) rather than saving a thumbnail-less row. Adopts the
	// minted id on first save and rewrites the URL to /editor/<id> so subsequent
	// saves (and the browser back/forward) target the same row.
	const persist = async (): Promise<string | null> => {
		const thumbnail = renderMapThumbnail(map)
		if (!thumbnail) {
			addToast('Map preview is still loading — try again in a moment.', 'warn')
			return null
		}
		const result = await publishMap(await mapHasherAsync(map), thumbnail, {
			id: currentMapId,
			name: map?.title ?? 'Untitled map',
		})
		if (!result) return null
		if (!currentMapId) {
			currentMapId = result.id
			// This draft was autosaved under the shared `new` slot; it now lives under
			// its own id, so drop the `new` backup or a future blank editor would
			// recover this map into it. Ongoing edits re-draft under the id slot.
			clearDraft(undefined)
			await goto(`/editor/${result.id}`, { replaceState: true, noScroll: true, keepFocus: true })
		}
		return result.id
	}

	// A re-save overwrites the saved row in place, so confirm it first with our own
	// dialog (never the browser's blocking confirm()). Resolves true to proceed.
	// A first save (no id yet) creates a fresh map and needs no confirmation.
	const confirmSave = (): Promise<boolean> => {
		if (!currentMapId) return Promise.resolve(true)
		return new Promise((resolve) => {
			resolveOverwrite = resolve
			confirmOverwriteOpen = true
		})
	}
	const answerOverwrite = (ok: boolean) => {
		confirmOverwriteOpen = false
		resolveOverwrite?.(ok)
		resolveOverwrite = null
	}
	// Dismissing the dialog any other way (X button, Esc) counts as a cancel, so a
	// waiting save never hangs. answerOverwrite already nulls the resolver first, so
	// this can't double-resolve a button press.
	$effect(() => {
		if (!confirmOverwriteOpen && resolveOverwrite) {
			resolveOverwrite(false)
			resolveOverwrite = null
		}
	})

	const saveMap = async () => {
		if (saving || sharing) return
		if (!(await confirmSave())) return
		saving = true
		try {
			if (await persist()) addToast('Saved to your maps')
		} finally {
			saving = false
		}
	}
	const shareMap = async () => {
		if (saving || sharing) return
		if (!(await confirmSave())) return
		sharing = true
		try {
			const id = await persist()
			if (id) await shareLink(id, map?.title ?? 'ThunderLite Online')
		} finally {
			sharing = false
		}
	}

	// Start a brand-new, empty map. Drop the in-memory link and the shared `new`
	// draft / last-active pointer so nothing is recovered into it, then hard-reset
	// the board — a save from here mints a new row rather than overwriting the last.
	const newMap = () => {
		if (saving || sharing) return
		mapStore.set(null)
		activeMapIdStore.set(undefined)
		clearDraft(undefined)
		clearLastActiveMapId()
		currentMapId = undefined
		map = freshEmptyMap()
		commitEdit()
		// Reflect the fresh-start intent in the URL so a reload stays blank instead
		// of reopening the last map (the ?new guard in onMount).
		goto('/editor?new', { replaceState: true, noScroll: true, keepFocus: true })
	}
	// Open the Load picker and (lazily, once) pull the user's own library. The
	// listing rows carry no map_data, so picking one navigates to /editor/<id>
	// where the server loads that map's hash.
	const openLoad = async () => {
		openLoadModal = true
		if (myMaps.length || loadingMaps) return
		loadingMaps = true
		loadError = ''
		try {
			const res = await fetch('/api/maps?mine=1')
			if (!res.ok) throw new Error('bad status')
			const data = await res.json()
			myMaps = data.maps ?? []
		} catch {
			loadError = 'Could not load your maps. Try again.'
		} finally {
			loadingMaps = false
		}
	}

	// Switch the editor to another saved map. Flush the current draft first (the
	// autosave is debounced and may not have fired yet) so nothing in-flight is
	// lost, then do a full navigation — the editor component is reused across
	// /editor/<id> routes and only reads the map on mount, so a hard load is what
	// actually swaps in the selected board.
	const loadMap = (id: string) => {
		if (id === currentMapId) {
			openLoadModal = false
			return
		}
		saveDraft(map, currentMapId)
		window.location.href = `/editor/${id}`
	}

	// Delete a saved map from the Load picker (never the one being edited — its
	// card hides the trash button). Success drops it from the listing in place.
	const askDeleteMap = (target: MapDBData) => {
		deleteTarget = target
		confirmDeleteOpen = true
	}
	const removeMap = async () => {
		const target = deleteTarget
		if (!target || deletingMap) return
		deletingMap = true
		try {
			if (await deleteMap(target.public_id)) {
				myMaps = myMaps.filter((m) => m.public_id !== target.public_id)
				addToast('Map deleted')
				confirmDeleteOpen = false
				deleteTarget = null
			}
		} finally {
			deletingMap = false
		}
	}

	const playMap = async () => {
		if (!canPlay) return
		mapStore.set(map)
		// Hand a deep clone (round-tripped through the serializer) to the play page
		// so gameplay mutations never leak back into the editor draft. The board
		// rides in the client store across navigation — nothing in the URL.
		playMapStore.set(deriveFromData(JSON.parse(exportMapData(map))))
		await goto(`/play?ephemeral=1`)
	}

	const tools = [
		{ label: 'Save', icon: 'fluent:save-24-filled', act: saveMap },
		{ label: 'Share', icon: 'gg:share', act: shareMap },
	] as const

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

	$effect.pre(() => {
		mapStore.set(map)
		// Keep the in-memory link in step with the board so a bare-route remount
		// (see currentMapId's initializer) re-adopts the right saved map.
		activeMapIdStore.set(currentMapId)
	})

	// Continuously back the working draft up to localStorage (debounced) so an
	// accidental reload or a browser crash can't lose unsaved work. Skipped on the
	// server; scoped by map id so distinct maps don't overwrite each other.
	// Plain let, NOT $state: a timer handle read+written only here and in onDestroy.
	// As $state the effect below read it (clearTimeout) and wrote it (setTimeout),
	// which is a read-write-same-state infinite loop.
	let autosaveTimer: ReturnType<typeof setTimeout> | undefined
	$effect(() => {
		// Fire on each in-place paint (editVersion) and on map identity changes
		// (resize apply / recovered draft — reading `map` tracks those).
		void editVersion
		void map
		if (browser && map) {
			clearTimeout(autosaveTimer)
			const snapshot = map
			autosaveTimer = setTimeout(() => saveDraft(snapshot, currentMapId), 500)
		}
	})

	// On a fresh load (not a mid-session return), restore any autosaved draft for
	// this editing context — but only when it actually differs from what we'd
	// otherwise show, so a clean reload doesn't nag with a recovery toast.
	onMount(() => {
		// An explicit "New map" (?new) always wins: wipe any in-memory link and the
		// shared `new` backup so this board is a clean slate that saves as a new row.
		if (new URLSearchParams(window.location.search).has('new')) {
			mapStore.set(null)
			activeMapIdStore.set(undefined)
			clearDraft(undefined)
			clearLastActiveMapId()
			currentMapId = undefined
			// The board initialized from the (now-stale) in-memory map on this remount;
			// swap in a blank one unless it already is blank (avoids a needless repaint).
			if (exportMapData(map) !== exportMapData(deriveFromHash(undefined))) {
				map = freshEmptyMap()
			}
			return
		}
		if (resumedFromMemory) return
		// A blank editor (bare /editor, no in-progress `new` draft) reopens the last
		// saved map the user was editing, so their edits keep flowing to that same
		// row instead of forking a duplicate on the next save.
		if (!mapId && !loadDraft(undefined)) {
			const lastId = getLastActiveMapId()
			if (lastId) {
				goto(`/editor/${lastId}`, { replaceState: true })
				return
			}
		}
		const recovered = loadDraft(currentMapId)
		if (recovered && recovered.data !== exportMapData(map)) {
			map = applyEditorFilters(recovered.map)
			// A recovered draft may know the saved map it belongs to; re-link so a
			// save updates it rather than creating a duplicate.
			if (recovered.mapId && !currentMapId) currentMapId = recovered.mapId
			addToast('Recovered unsaved changes from your last session')
		}
	})
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
				onclick={() => (openOptionsModal = true)}
				title="Resize map"
				class="chip shrink-0 transition-colors hover:bg-surface-3"
			>
				<Icon icon="mdi:resize" width="13" height="13" />
				{map.cols} × {map.rows}
			</button>
		</div>

		<div class="flex items-center gap-1">
			<button
				type="button"
				onclick={newMap}
				title="Start a new, empty map"
				class="btn btn-ghost btn-sm"
			>
				<Icon icon="fluent:document-add-24-filled" width="16" height="16" />
				<span class="hidden lg:inline">New</span>
			</button>
			<button
				type="button"
				onclick={openLoad}
				title="Load one of your maps"
				class="btn btn-ghost btn-sm"
			>
				<Icon icon="fluent:folder-open-24-filled" width="16" height="16" />
				<span class="hidden lg:inline">Load</span>
			</button>
			{#each tools as tool (tool.label)}
				{@const busy = (tool.label === 'Save' && saving) || (tool.label === 'Share' && sharing)}
				<button
					type="button"
					onclick={tool.act}
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
					<span class="hidden lg:inline">{busy ? `${tool.label}…` : tool.label}</span>
				</button>
			{/each}
			<button
				type="button"
				onclick={() => (openScriptModal = true)}
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
				onclick={() => (openOptionsModal = true)}
				title="Map options"
				class="btn btn-ghost btn-sm"
			>
				<Icon icon="gis:map-options" width="16" height="16" />
				<span class="hidden lg:inline">Options</span>
			</button>
			<div class="mx-1 h-5 w-px bg-border"></div>
			<button
				type="button"
				onclick={playMap}
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
			Eraser active. Click or drag across tiles to {editType === 'units'
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
			<!-- Keyed on the board's identity. `map` is `$state.raw`, and MapRender's
			     Scroller closes over the map it mounted with, so swapping the object
			     (resize apply / draft recovery / New map) used to leave the canvas
			     painting the PREVIOUS board indefinitely — the editor showed one map
			     and Save wrote another. Remounting on identity change is what keeps
			     what you see and what you save the same board. Paints don't reassign
			     `map` (they bump `repaintSignal`), so this never fires mid-edit. -->
			{#key map}
				<MapRender
					pause
					editor
					{map}
					{select}
					{contextLoaded}
					backdrop="bg-surface-2 grid-pattern"
				/>
			{/key}
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

<MapOptions {map} bind:open={openOptionsModal} apply={(appliedChanges) => (map = appliedChanges)}>
	{#snippet children({ updatedMap })}
		<MapRender pause mini map={updatedMap} select={() => {}} backdrop="bg-surface-2" />
	{/snippet}
</MapOptions>

<Modal title="Load a map" bind:open={openLoadModal} outsideclose size="xl">
	<section class="flex flex-col gap-3">
		<p class="text-sm text-muted-foreground">
			Open one of your saved maps in the editor. Unsaved changes to the current map are kept as a
			local draft.
		</p>

		{#if loadingMaps}
			<div class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
				<Icon icon="mdi:loading" width="18" height="18" class="animate-spin" />
				Loading your maps…
			</div>
		{:else if loadError}
			<div
				class="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
			>
				<Icon icon="mdi:alert-circle" width="16" height="16" class="shrink-0" />
				{loadError}
			</div>
		{:else if myMaps.length === 0}
			<div class="py-10 text-center text-sm text-muted-foreground">
				You haven't saved any maps yet. Save this one to start your library.
			</div>
		{:else}
			<div class="grid max-h-[60vh] gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
				{#each myMaps as m (m.public_id)}
					<div class="relative">
						<button
							type="button"
							onclick={() => loadMap(m.public_id)}
							disabled={m.public_id === currentMapId}
							class="card flex w-full flex-col overflow-hidden text-left transition-shadow enabled:hover:shadow-md disabled:cursor-default disabled:opacity-60"
						>
							<div class="aspect-video bg-surface-2">
								<MapThumbnail map={m} />
							</div>
							<div class="flex items-center justify-between gap-2 p-2.5">
								<span class="truncate text-sm font-semibold tracking-tight text-foreground">
									{m.name ?? 'Untitled map'}
								</span>
								{#if m.public_id === currentMapId}
									<span class="chip shrink-0 text-[10px] tracking-wide uppercase">Editing</span>
								{/if}
							</div>
						</button>
						{#if m.public_id !== currentMapId}
							<button
								type="button"
								onclick={() => askDeleteMap(m)}
								class="btn btn-ghost btn-sm absolute top-2 right-2 bg-surface/80 text-destructive backdrop-blur-sm"
								title="Delete map"
								aria-label={`Delete ${m.name ?? 'Untitled map'}`}
							>
								<Icon icon="lucide:trash-2" width="14" height="14" />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	{#snippet footer()}
		<a href="/my/maps" class="btn btn-ghost">
			<Icon icon="lucide:external-link" width="14" height="14" />
			Manage in My Maps
		</a>
		<button type="button" onclick={() => (openLoadModal = false)} class="btn btn-primary ml-auto">
			<Icon icon="mdi:close" width="16" height="16" />
			Close
		</button>
	{/snippet}
</Modal>

<Modal title="Delete map?" bind:open={confirmDeleteOpen} size="sm">
	<div class="flex items-start gap-3">
		<span
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive"
		>
			<Icon icon="lucide:trash-2" width="18" height="18" />
		</span>
		<p class="text-sm text-muted-foreground">
			This will permanently remove
			<span class="font-semibold text-foreground">{deleteTarget?.name ?? 'Untitled map'}</span>
			from your library. Its share link will stop working. This can't be undone.
		</p>
	</div>

	{#snippet footer()}
		<button type="button" onclick={() => (confirmDeleteOpen = false)} class="btn btn-ghost">
			<Icon icon="mdi:close" width="16" height="16" />
			Cancel
		</button>
		<button
			type="button"
			onclick={removeMap}
			disabled={deletingMap}
			class="btn btn-destructive ml-auto"
		>
			{#if deletingMap}
				<Icon icon="mdi:loading" width="16" height="16" class="animate-spin" />
			{:else}
				<Icon icon="lucide:trash-2" width="16" height="16" />
			{/if}
			Delete
		</button>
	{/snippet}
</Modal>

<Modal title="Overwrite saved map?" bind:open={confirmOverwriteOpen} size="sm">
	<div class="flex items-start gap-3">
		<span
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600"
		>
			<Icon icon="mdi:content-save-alert" width="20" height="20" />
		</span>
		<p class="text-sm text-muted-foreground">
			This will update your map
			<span class="font-semibold text-foreground">{map?.title?.trim() || 'Untitled map'}</span>
			in the database, replacing what's currently saved. This can't be undone.
		</p>
	</div>

	{#snippet footer()}
		<button type="button" onclick={() => answerOverwrite(false)} class="btn btn-ghost">
			<Icon icon="mdi:close" width="16" height="16" />
			Cancel
		</button>
		<button type="button" onclick={() => answerOverwrite(true)} class="btn btn-primary ml-auto">
			<Icon icon="mdi:content-save" width="16" height="16" />
			Overwrite
		</button>
	{/snippet}
</Modal>

<Modal title="Map script" bind:open={openScriptModal} outsideclose size="xl">
	<section class="flex flex-col gap-3">
		<p class="text-sm text-muted-foreground">
			Author cutscene-style logic that runs while this map is played: dialogue, camera moves,
			spawns, weather, funds, victory/defeat, and more. Blocks fire on level load (<code
				>&lt;start&gt;</code
			>), each side-turn (<code>&lt;turn N,T&gt;</code>), and match end (<code>&lt;win&gt;</code> /
			<code>&lt;lose&gt;</code>).
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
					{#if scriptError.line > 0}<strong>Line {scriptError.line}:</strong>
					{/if}{scriptError.message}
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
		<button type="button" onclick={() => (openScriptModal = false)} class="btn btn-primary ml-auto">
			<Icon icon="mdi:check" width="16" height="16" />
			Done
		</button>
	{/snippet}
</Modal>

{#snippet brushTab(brush: Brush, icon: string, label: string)}
	<button
		type="button"
		onclick={setBrush(brush)}
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
							onclick={changeTeam(i)}
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
							onclick={changeTeam(NEUTRAL_TEAM)}
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
				onclick={toggleErase}
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
	<!-- The sea-obstacle sprites (Reef / Archipelago / Rock Formation) and the bridge
	     decks (connector 4) have their water knocked out to transparency (drawn over live
	     water in-game), so back every ocean terrain and bridge with a water tone in the
	     palette. Opaque tiles (Sea / Shore) hide it. -->
	<img
		class="pointer-events-none min-w-fit object-cover object-top-left"
		src={terrainData[tType].url}
		alt={terrainData[tType].name}
		style="{terrainData[tType].ocean || terrainData[tType].connector === 4
			? 'background-color: #3c6bbe;'
			: ''} margin: {-terrainData[tType].yOffset}px {-terrainData[tType].xOffset}px 0 {-(
			terrainData[tType].editorState ?? 0
		) * 60}px;"
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
	<!-- Weather sprites are mostly white (clouds, rain, snow) with transparency, so
	     they disappear against the light palette button. Sit them on a dark sky-like
	     wash — matching how they read over the map — so each one is legible. -->
	<div
		class="pointer-events-none absolute inset-0 bg-linear-to-b from-slate-700 to-slate-900"
	></div>
	<img
		class="pointer-events-none relative min-w-fit object-cover object-top-left"
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
						Click or drag across tiles to {editType === 'units'
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
