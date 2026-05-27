<script lang="ts">
	import { onDestroy } from 'svelte'
	import type { socketSelect } from '$lib/Components/Socket/socket'
	import { gameState, initGameStateFromMap } from './gameState'
	import { endTurn } from './turnLoop'
	import { setSelectedTile } from './uiState'
	import { runCpuTurn, type CpuAiHandle } from './cpuAi'
	import HUDRoot from './HUD/HUDRoot.svelte'
	import BuildMenu from './HUD/BuildMenu.svelte'
	import ActionMenu from './HUD/ActionMenu.svelte'
	import GameOverModal from './HUD/GameOverModal.svelte'

	export let interactor: undefined | ReturnType<typeof socketSelect>
	export let endTurnAction: (() => void) | undefined = undefined
	export let localTeam: number = 0
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export const userSession: string = ''
	export let gameSession: string = ''
	export let map: MapObject | undefined = undefined

	const isMultiplayer =
		gameSession !== '' && gameSession !== 'ephemeral' && gameSession !== 'testSession'

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
		if (!isMultiplayer && $gameState.currentTeam !== localTeam) return

		if (map) setSelectedTile(y * map.cols + x)
		interactor(x, y)
	}

	const handleEndTurn = () => {
		if (endTurnAction) {
			endTurnAction()
			return
		}
		endTurn({ map })
	}

	let cpuHandle: CpuAiHandle | null = null
	let lastCpuKey = ''
	$: {
		const s = $gameState
		const isCpu = !isMultiplayer && s.phase === 'playing' && s.currentTeam !== localTeam
		const key = isCpu ? `${s.currentTeam}:${s.turnNumber}` : ''
		if (key !== lastCpuKey) {
			lastCpuKey = key
			if (cpuHandle) {
				cpuHandle.cancel()
				cpuHandle = null
			}
			if (isCpu && map) {
				cpuHandle = runCpuTurn({
					humanTeam: localTeam,
					endTurn: handleEndTurn,
					map,
				})
			}
		}
	}

	onDestroy(() => {
		if (cpuHandle) cpuHandle.cancel()
	})
</script>

<slot {select}></slot>

<HUDRoot {map} onEndTurn={handleEndTurn} />
<BuildMenu {map} />
<ActionMenu {map} />
<GameOverModal />
