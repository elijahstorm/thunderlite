<script lang="ts">
	import type { socketSelect } from '$lib/Components/Socket/socket'
	import { initGameStateFromMap } from './gameState'
	import { endTurn } from './turnLoop'
	import { setSelectedTile } from './uiState'
	import HUDRoot from './HUD/HUDRoot.svelte'
	import BuildMenu from './HUD/BuildMenu.svelte'
	import ActionMenu from './HUD/ActionMenu.svelte'
	import GameOverModal from './HUD/GameOverModal.svelte'

	export let interactor: undefined | ReturnType<typeof socketSelect>
	// Sessions are wired in from the page but are not used here yet — they
	// will feed into networked turn ownership in a later card.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export let userSession: string
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export let gameSession: string
	export let map: MapObject | undefined = undefined

	let state: 'waiting' | 'animating' | 'overlay' = 'waiting'
	let active = false

	let lastMap: MapObject | undefined
	$: if (map && map !== lastMap) {
		lastMap = map
		initGameStateFromMap(map)
	}

	const select = (x: number, y: number) => {
		if (!interactor) return
		if (state !== 'waiting') return
		if (active) return

		if (map) setSelectedTile(y * map.cols + x)
		interactor(x, y)
	}

	const handleEndTurn = () => {
		endTurn({ map })
	}
</script>

<slot {select} />

<HUDRoot {map} onEndTurn={handleEndTurn} />
<BuildMenu {map} />
<ActionMenu {map} />
<GameOverModal />
