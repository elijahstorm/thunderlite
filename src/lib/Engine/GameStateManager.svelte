<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import type { socketSelect } from '$lib/Components/Socket/socket'
	import { gameState, initGameStateFromMap } from './gameState'
	import { emitMatchEnd, resetMatchEnd, buildMatchResult } from './matchEnd'
	import { endTurn } from './turnLoop'
	import { setSelectedTile } from './uiState'
	import { runCpuTurn, type CpuAiHandle } from './cpuAi'
	import { MusicDirector } from '$lib/Audio/musicDirector'
	import { weatherAudio, weatherForMap } from '$lib/Audio/weatherAudio'
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
		// A fresh board is a fresh match — clear the emit-once guard so this match
		// can fire its own match-end event (J1).
		resetMatchEnd()
		// F3 weather → env ambience: loop the matching track while sky weather is
		// on the board, stop it otherwise. Idempotent (no-op when unchanged), so
		// re-renders and replayed states never restack the loop.
		weatherAudio.setWeather(weatherForMap(map))
	}

	// J1 — match-end hook. The engine flips `phase` to `gameOver` from many call
	// sites (applyAction, turnLoop, interactor); rather than instrument each, we
	// observe the authoritative transition here and emit once. `emitMatchEnd` is
	// idempotent per match, so this reactive block re-running is harmless. The
	// winner is read straight from the engine state, never from any UI claim.
	$: if (map && $gameState.phase === 'gameOver') {
		emitMatchEnd(
			buildMatchResult({
				state: $gameState,
				winner: typeof $gameState.winner === 'number' ? $gameState.winner : null,
				mode: isMultiplayer ? 'online' : 'hotseat',
				localTeam,
				isCpuTeam: (team) => !isMultiplayer && team !== localTeam,
				sessionId: isMultiplayer ? gameSession : undefined,
			})
		)
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

	// Music director: keyed to game phase. In single-player every opponent is a
	// CPU, so its turns play the "thinking" theme; in multiplayer they're human.
	let musicDirector: MusicDirector | null = null
	onMount(() => {
		musicDirector = new MusicDirector({
			localTeam,
			isCpuTeam: () => !isMultiplayer,
		})
		musicDirector.start()
		return () => {
			musicDirector?.stop()
			musicDirector = null
		}
	})

	onDestroy(() => {
		if (cpuHandle) cpuHandle.cancel()
		weatherAudio.clear()
	})
</script>

<slot {select}></slot>

<HUDRoot {map} onEndTurn={handleEndTurn} />
<BuildMenu {map} />
<ActionMenu {map} />
<GameOverModal />
