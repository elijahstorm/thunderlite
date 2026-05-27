<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import type { socketSelect } from '$lib/Components/Socket/socket'
	import { gameState, initGameStateFromMap } from './gameState'
	import { emitMatchEnd, resetMatchEnd, buildMatchResult, type MatchMode } from './matchEnd'
	import { resetMatchStats, matchStatsList } from './matchStats'
	import { registerRecordMatch } from '$lib/Database/recordMatch'
	import { registerCampaignProgress } from '$lib/Campaign/progress'
	import { endTurn } from './turnLoop'
	import { setSelectedTile } from './uiState'
	import { runCpuTurn, type CpuAiHandle } from './cpuAi'
	import { MusicDirector } from '$lib/Audio/musicDirector'
	import { weatherAudio, weatherForMap } from '$lib/Audio/weatherAudio'
	import HUDRoot from './HUD/HUDRoot.svelte'
	import BuildMenu from './HUD/BuildMenu.svelte'
	import ActionMenu from './HUD/ActionMenu.svelte'
	import StatsScreen from './HUD/StatsScreen.svelte'

	export let interactor: undefined | ReturnType<typeof socketSelect>
	export let endTurnAction: (() => void) | undefined = undefined
	export let localTeam: number = 0
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export const userSession: string = ''
	export let gameSession: string = ''
	export let map: MapObject | undefined = undefined

	// K4 — campaign integration. When `mode` is supplied it overrides the
	// hotseat/online derivation (campaign is single-player, never a socket match);
	// `campaignLevelId` rides into the match result so K3's unlock subscriber knows
	// which level was beaten, and the Continue/Retry callbacks wire the stats
	// screen to the campaign shell's auto-advance / reload flow.
	export let mode: MatchMode | undefined = undefined
	export let campaignLevelId: string | undefined = undefined
	export let onContinue: (() => void) | undefined = undefined
	export let onRetry: (() => void) | undefined = undefined
	export let campaignHref: string = '/campaign'

	const isMultiplayer =
		gameSession !== '' && gameSession !== 'ephemeral' && gameSession !== 'testSession'

	$: resolvedMode = mode ?? (isMultiplayer ? 'online' : 'hotseat')

	let state: 'waiting' | 'animating' | 'overlay' = 'waiting'
	let active = false

	let lastMap: MapObject | undefined
	$: if (map && map !== lastMap) {
		lastMap = map
		initGameStateFromMap(map)
		// A fresh board is a fresh match — clear the emit-once guard so this match
		// can fire its own match-end event (J1), and zero the stat tracker (J2).
		resetMatchEnd()
		resetMatchStats()
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
				mode: resolvedMode,
				campaignLevelId,
				localTeam,
				isCpuTeam: (team) => !isMultiplayer && team !== localTeam,
				sessionId: isMultiplayer ? gameSession : undefined,
				// J2 — carry the live per-player stat tracker into the result so the
				// stats screen (and J3 persistence) read it off `MatchResult.stats`.
				stats: matchStatsList(),
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

	// Rematch (hotseat/online) — replay the same board from scratch: re-seed game
	// state and clear the J1/J2 trackers so a new match-end can fire and re-count.
	const handleRematch = () => {
		if (!map) return
		initGameStateFromMap(map)
		resetMatchEnd()
		resetMatchStats()
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
	// J3 — persistence is just another match-end subscriber, registered alongside
	// the stats screen and (later) campaign unlocks. It owns no game logic; it
	// only writes results when a match ends.
	let offRecordMatch: (() => void) | undefined
	// K3 — campaign unlock is another match-end subscriber, peer to recordMatch. It
	// is a no-op for non-campaign results (it checks `result.mode`), so registering
	// it for every match is safe and keeps the wiring in one place.
	let offCampaignProgress: (() => void) | undefined
	onMount(() => {
		offRecordMatch = registerRecordMatch()
		offCampaignProgress = registerCampaignProgress()
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
		offRecordMatch?.()
		offCampaignProgress?.()
	})
</script>

<slot {select}></slot>

<HUDRoot {map} onEndTurn={handleEndTurn} />
<BuildMenu {map} />
<ActionMenu {map} />
<StatsScreen {localTeam} onRematch={handleRematch} {onContinue} {onRetry} {campaignHref} />
