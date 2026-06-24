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
	import { teamHasPendingActions } from './pendingActions'
	import { routeAnimation, animations, animationBusy } from './Animator/animator'
	import { actionMenuState } from './HUD/actionMenuStore'
	import { buildMenuState } from './HUD/buildMenuStore'
	import { interactionState, interactionSource } from './Interactor/interactionState'
	import { reopenMenuFromPeek } from './Interactor/interactor'
	import { animateTeamDefeat } from './defeat'
	import { MusicDirector } from '$lib/Audio/musicDirector'
	import { weatherAudio, weatherForMap } from '$lib/Audio/weatherAudio'
	import HUDRoot from './HUD/HUDRoot.svelte'
	import BuildMenu from './HUD/BuildMenu.svelte'
	import ActionMenu from './HUD/ActionMenu.svelte'
	import StatsScreen from './HUD/StatsScreen.svelte'
	import TurnTransition from './HUD/TurnTransition.svelte'
	import { turnTransitionActive } from './HUD/turnTransitionStore'

	export let interactor: undefined | ReturnType<typeof socketSelect>
	export let endTurnAction: (() => void) | undefined = undefined
	export let localTeam: number = 0

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

	// Pause between the local player's last action finishing and the turn
	// auto-ending, so the flip to the next side isn't too quick to register.
	const AUTO_END_TURN_DELAY_MS = 500

	const isMultiplayer =
		gameSession !== '' && gameSession !== 'ephemeral' && gameSession !== 'testSession'

	$: resolvedMode = mode ?? (isMultiplayer ? 'online' : 'hotseat')

	let state: 'waiting' | 'animating' | 'overlay' = 'waiting'
	let active = false

	// Teams whose defeat explosions have already been kicked off this match, so
	// the reactive block below fires the sequence exactly once per elimination.
	let defeatedTeams = new Set<number>()

	let lastMap: MapObject | undefined
	// Pristine copy of the board taken before any engine mutation. The engine
	// edits `map.layers` in place all match (units die, buildings flip teams), so
	// a rematch must restore from this snapshot — re-deriving players from the
	// end-of-match layers would resurrect a board with the losers already wiped.
	let initialLayers: MapLayers | undefined
	$: if (map && map !== lastMap) {
		lastMap = map
		initialLayers = structuredClone(map.layers)
		defeatedTeams = new Set<number>()
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

	// When a team is eliminated — by forfeit or by losing its last unit/HQ — blow
	// up everything it still owns with the death explosion. Runs on each client
	// independently off the deterministic `hasLost` flip, so both sides see the
	// same army go up. The results screen (StatsScreen) waits on `defeatAnimating`
	// so these blasts aren't immediately hidden behind it.
	$: if (map) {
		for (const player of $gameState.players) {
			if (player.hasLost && !defeatedTeams.has(player.team)) {
				defeatedTeams.add(player.team)
				void animateTeamDefeat(map, player.team)
			}
		}
	}

	const select = (x: number, y: number) => {
		if (!interactor) return
		if (state !== 'waiting') return
		if (active) return
		if (!isMultiplayer && $gameState.currentTeam !== localTeam) return
		if ($turnTransitionActive) return

		// A tap while a moved unit's menu is "peeking" re-summons that menu rather
		// than running a fresh selection — the unit is still mid-decision, so the
		// click brings its choices back instead of doing anything else.
		if (map && $actionMenuState.peeking) {
			if (reopenMenuFromPeek(map)) return
		}

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

	// Rematch (hotseat/online) — replay the same board from scratch: restore the
	// board to its pre-match snapshot, then re-seed game state and clear the
	// J1/J2 trackers so a new match-end can fire and re-count.
	const handleRematch = () => {
		if (!map) return
		if (initialLayers) map.layers = structuredClone(initialLayers)
		map.route = []
		map.highlights = new Array(map.cols * map.rows)
		map.pathHistory = []
		defeatedTeams = new Set<number>()
		autoEndedTurnKey = ''
		initGameStateFromMap(map)
		resetMatchEnd()
		resetMatchStats()
	}

	// `$turnTransitionActive` is part of the key so the CPU only starts thinking
	// after the slide-in/slide-out overlay finishes. While the transition is up,
	// the key collapses to '' and any in-flight handle is cancelled; when the
	// flag flips back to false the block re-fires with the real key and a fresh
	// `runCpuTurn` is scheduled.
	let cpuHandle: CpuAiHandle | null = null
	let lastCpuKey = ''
	$: {
		const s = $gameState
		const transitioning = $turnTransitionActive
		const isCpu = !isMultiplayer && s.phase === 'playing' && s.currentTeam !== localTeam
		const key = isCpu && !transitioning ? `${s.currentTeam}:${s.turnNumber}` : ''
		if (key !== lastCpuKey) {
			lastCpuKey = key
			if (cpuHandle) {
				cpuHandle.cancel()
				cpuHandle = null
			}
			if (isCpu && !transitioning && map) {
				cpuHandle = runCpuTurn({
					humanTeam: localTeam,
					endTurn: handleEndTurn,
					map,
				})
			}
		}
	}

	// Auto-end the local player's turn the moment there's nothing left to do —
	// every owned unit has acted and no factory can still produce. We only fire
	// while the engine is fully idle (no animation, no open menu, no in-flight
	// selection); that idle gate is what keeps it from triggering mid-action, e.g.
	// in the gap between a move and its post-move menu, or during the
	// move→strike→explosion of an attack (the moved unit is already marked acted
	// at those points). `autoEndedTurnKey` guards against firing more than once for
	// the same turn, which matters in online play where `handleEndTurn` relays over
	// the socket and `currentTeam` doesn't flip locally until the server replies.
	// The end-turn is deferred out of this reactive block on a short timer — both
	// because mutating gameState synchronously inside Svelte's flush left the CPU
	// reactive block (above) stuck on the pre-flip state (so the CPU's `runCpuTurn`
	// was never scheduled after an auto-ended turn), and to give the player a beat
	// to register the result of their final action before the board flips and the
	// turn-transition overlay slides in. Without that pause the flip is too quick
	// for a human to follow.
	let autoEndedTurnKey = ''
	let autoEndTimer: ReturnType<typeof setTimeout> | null = null
	$: {
		const s = $gameState
		const turnKey = `${s.currentTeam}:${s.turnNumber}`
		const idle =
			$routeAnimation === null &&
			$animations.length === 0 &&
			// A multi-beat attack (strike → bar ease → counter) or a standalone health
			// ease holds this above zero through its quiet gaps, so the turn can't
			// auto-end and slam the enemy-turn intro over a still-playing counter.
			$animationBusy === 0 &&
			!$actionMenuState.open &&
			!$actionMenuState.peeking &&
			!$buildMenuState.open &&
			$interactionState === 'select' &&
			$interactionSource === null
		if (
			map &&
			s.phase === 'playing' &&
			s.currentTeam === localTeam &&
			idle &&
			!$turnTransitionActive &&
			autoEndedTurnKey !== turnKey &&
			!teamHasPendingActions(map, s)
		) {
			autoEndedTurnKey = turnKey
			if (autoEndTimer) clearTimeout(autoEndTimer)
			autoEndTimer = setTimeout(() => {
				autoEndTimer = null
				handleEndTurn()
			}, AUTO_END_TURN_DELAY_MS)
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
		if (autoEndTimer) clearTimeout(autoEndTimer)
		weatherAudio.clear()
		offRecordMatch?.()
		offCampaignProgress?.()
	})
</script>

<slot {select}></slot>

<HUDRoot {map} onEndTurn={handleEndTurn} {localTeam} cpuOpponent={!isMultiplayer} />
<BuildMenu {map} />
<ActionMenu {map} />
<StatsScreen {localTeam} onRematch={handleRematch} {onContinue} {onRetry} {campaignHref} />
<TurnTransition {localTeam} cpuOpponent={!isMultiplayer} />
