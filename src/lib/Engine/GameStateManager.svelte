<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import type { socketSelect } from '$lib/Components/Socket/socket'
	import { gameState, initGameStateFromMap } from './gameState'
	import { emitMatchEnd, resetMatchEnd, buildMatchResult, type MatchMode } from './matchEnd'
	import { resetMatchStats, matchStatsList } from './matchStats'
	import { resetDevLog } from './devLog'
	import { registerRecordMatch } from '$lib/Database/recordMatch'
	import { registerCampaignProgress } from '$lib/Campaign/progress'
	import { endTurn } from './turnLoop'
	import { applyAction } from './applyAction'
	import { outgoingActions } from './outgoingActions'
	import { setSelectedTile } from './uiState'
	import { runCpuTurn, type CpuAiHandle } from './cpuAi'
	import { setCpuSeed, randomCpuSeed } from './cpuAi/rng'
	import { teamHasPendingActions } from './pendingActions'
	import { controlsTeam } from './turnOwnership'
	import { routeAnimation, animations, animationBusy, boardBusy } from './Animator/animator'
	import { actionMenuState } from './HUD/actionMenuStore'
	import { buildMenuState } from './HUD/buildMenuStore'
	import { interactionState, interactionSource } from './Interactor/interactionState'
	import { reopenMenuFromPeek, openInPlaceMenu, resetInteraction } from './Interactor/interactor'
	import { animateTeamDefeat } from './defeat'
	import { MusicDirector } from '$lib/Audio/musicDirector'
	import { seedFromString } from '$lib/Audio/musicVariation'
	import { weatherAudio, weatherForMap } from '$lib/Audio/weatherAudio'
	import HUDRoot from './HUD/HUDRoot.svelte'
	import BuildMenu from './HUD/BuildMenu.svelte'
	import ActionMenu from './HUD/ActionMenu.svelte'
	import StatsScreen from './HUD/StatsScreen.svelte'
	import TurnTransition from './HUD/TurnTransition.svelte'
	import { turnTransitionActive } from './HUD/turnTransitionStore'
	import { campaignScriptActive } from '$lib/Campaign/scriptGate'
	import { syncLocked } from './desync'

	interface Props {
		interactor: undefined | ReturnType<typeof socketSelect>
		endTurnAction?: (() => void) | undefined
		localTeam?: number
		// Online CPU seats: which teams a CPU plays, and whether THIS client is the
		// one that drives them (the lowest-seat human relays the AI's moves).
		aiTeams?: number[]
		isAiDriver?: boolean
		userSession?: string
		gameSession?: string
		map?: MapObject | undefined
		/** Surface the corner overview map in the HUD stack (currently the play route). */
		minimap?: boolean
		fogOfWar?: boolean
		// K4 — campaign integration. When `mode` is supplied it overrides the
		// hotseat/online derivation (campaign is single-player, never a socket match);
		// `campaignLevelId` rides into the match result so K3's unlock subscriber knows
		// which level was beaten, and the Continue/Retry callbacks wire the stats
		// screen to the campaign shell's auto-advance / reload flow.
		mode?: MatchMode | undefined
		campaignLevelId?: string | undefined
		onContinue?: (() => void) | undefined
		onRetry?: (() => void) | undefined
		campaignHref?: string
		children?: import('svelte').Snippet<[{ select: (x: number, y: number) => void }]>
	}

	let {
		interactor,
		endTurnAction = undefined,
		localTeam = 0,
		aiTeams = [],
		isAiDriver = false,
		gameSession = '',
		map = undefined,
		minimap = false,
		fogOfWar = false,
		mode = undefined,
		campaignLevelId = undefined,
		onContinue = undefined,
		onRetry = undefined,
		campaignHref = '/campaign',
		children,
	}: Props = $props()

	// Pause between the local player's last action finishing and the turn
	// auto-ending, so the flip to the next side isn't too quick to register.
	const AUTO_END_TURN_DELAY_MS = 500

	// Online anti-stall: a human turn auto-ends after this long with no action,
	// so an idle/absent player can't freeze the match. Any committed action
	// (move/build/attack/capture) resets it; a countdown warning shows near the end.
	const TURN_TIMEOUT_MS = 30_000
	const TURN_WARN_SECONDS = 10

	// Online anti-stall for a CPU side THIS client drives. The AI's turn is real
	// gameplay running on exactly one machine, and no other player is allowed to
	// act for a seat that isn't theirs — so if this client wedges mid-turn (a
	// planner throw the tick's own net misses, an animation promise that never
	// settles) the match sits on the CPU's turn forever with nobody able to break
	// it. The driver therefore watches its own AI turn and force-ends it after this
	// long with no committed action. Longer than the human clock because the first
	// plan of a large army is a genuine pause, and every CPU action refreshes it.
	const AI_STALL_TIMEOUT_MS = 45_000

	const isMultiplayer = $derived(
		gameSession !== '' && gameSession !== 'ephemeral' && gameSession !== 'testSession'
	)

	const resolvedMode = $derived(mode ?? (isMultiplayer ? 'online' : 'hotseat'))

	let viewState: 'waiting' | 'animating' | 'overlay' = 'waiting'
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
	// `$effect.pre` (not `$effect`): this seeds `gameState` from the incoming board,
	// and the HUD/menu children below read that store — running before the DOM flush
	// keeps them from painting a frame against an empty/previous match's state.
	$effect.pre(() => {
		if (map && map !== lastMap) {
			lastMap = map
			initialLayers = structuredClone(map.layers)
			defeatedTeams = new Set<number>()
			initGameStateFromMap(map)
			// A fresh board is a fresh match — clear the emit-once guard so this match
			// can fire its own match-end event (J1), and zero the stat tracker (J2).
			resetMatchEnd()
			resetMatchStats()
			resetDevLog(localTeam)
			// Salt the CPU's tie-breaking for this match. Online, the game session gives
			// a stable salt, so the driver client re-planning after a reload lands on the
			// same choice it already relayed instead of diverging from the log. Offline
			// there is no session and nothing to stay consistent with, so a fresh random
			// salt makes every playthrough of the same level play differently. Leaving it
			// unset (salt 0) is the reproducible default the CPU tests rely on.
			setCpuSeed(gameSession || randomCpuSeed())
			// F3 weather → env ambience: loop the matching track while sky weather is
			// on the board, stop it otherwise. Idempotent (no-op when unchanged), so
			// re-renders and replayed states never restack the loop.
			weatherAudio.setWeather(weatherForMap(map))
		}
	})

	// J1 — match-end hook. The engine flips `phase` to `gameOver` from many call
	// sites (applyAction, turnLoop, interactor); rather than instrument each, we
	// observe the authoritative transition here and emit once. `emitMatchEnd` is
	// idempotent per match, so this reactive block re-running is harmless. The
	// winner is read straight from the engine state, never from any UI claim.
	$effect(() => {
		if (map && $gameState.phase === 'gameOver') {
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
	})

	// When a team is eliminated — by forfeit or by losing its last unit/HQ — blow
	// up everything it still owns with the death explosion. Runs on each client
	// independently off the deterministic `hasLost` flip, so both sides see the
	// same army go up. The results screen (StatsScreen) waits on `defeatAnimating`
	// so these blasts aren't immediately hidden behind it.
	$effect(() => {
		if (!map) return
		for (const player of $gameState.players) {
			if (player.hasLost && !defeatedTeams.has(player.team)) {
				defeatedTeams.add(player.team)
				void animateTeamDefeat(map, player.team)
			}
		}
	})

	// Double-click detection: a second click on the same tile inside this window
	// opens the unit's action menu in place (act without moving) instead of just
	// re-selecting it.
	const DOUBLE_CLICK_MS = 350
	let lastClickTile = -1
	let lastClickAt = 0

	const select = (x: number, y: number) => {
		if (!interactor) return
		if (viewState !== 'waiting') return
		if (active) return
		// Board input is only ever the LOCAL player's, so it's dead on anyone else's
		// turn. This used to be gated on `!isMultiplayer`, which left online matches
		// wide open: on the opponent's (or an online CPU seat's) turn every click was
		// still live, so tapping their Warfactory popped the build menu in their
		// colours, and tapping their un-acted units selected them — `canSelectUnit`
		// only asks whether the unit belongs to the team whose turn it is. Actions
		// taken that way mutate this client's board immediately; the relay is then
		// refused server-side ('Not your turn'), so the local board silently desyncs
		// from the match. Gate every turn the same way, online or not.
		if ($gameState.currentTeam !== localTeam) return
		// Board input is dead once this client is known to have diverged from the
		// room — see `desync.ts`. `interactor` guards itself too; this stops the
		// selection/hover bookkeeping above it from running at all.
		if ($syncLocked) return
		if ($turnTransitionActive) return
		// A campaign block is mutating the board — swallow input until it finishes so
		// a move can't resolve against a board the script is mid-rewrite of.
		if ($campaignScriptActive) return
		// Movement/attack animations from the previous action are still playing — swallow
		// input until the board settles so a click can't select or move a unit mid-anim.
		if ($boardBusy) return

		// A tap while a moved unit's menu is "peeking" re-summons that menu rather
		// than running a fresh selection — the unit is still mid-decision, so the
		// click brings its choices back instead of doing anything else.
		if (map && $actionMenuState.peeking) {
			if (reopenMenuFromPeek(map)) return
		}

		const tile = map ? y * map.cols + x : -1
		const now =
			typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
		const isDoubleClick = tile >= 0 && tile === lastClickTile && now - lastClickAt < DOUBLE_CLICK_MS
		lastClickTile = tile
		lastClickAt = now

		// Double-click a selectable own unit → open its action menu anchored where it
		// stands, so it can attack/capture/etc. without committing a move first.
		// Whether or not a menu opens, we always swallow this second click: the first
		// click already did the meaningful thing (selected the unit / moved onto the
		// tile / opened the build menu), so re-routing the second click would only undo
		// it — re-entering `choice` deselects the unit, and on an empty Warfactory tile
		// it pops the build menu. That re-routing is exactly what made units feel
		// un-movable on and around a factory when the player double-tapped.
		if (isDoubleClick && map) {
			lastClickTile = -1
			openInPlaceMenu(map, tile)
			return
		}

		if (map) setSelectedTile(tile)
		interactor(x, y)
	}

	// Clear any leftover selection / open menu / stale highlight whenever the active
	// side changes. Ending a turn mid-selection (e.g. picking a unit then hitting
	// End Turn, or building from a factory) used to leave `interactionState` stuck
	// on `choice`/`preview` with a stale source, so the next turn's first clicks were
	// misrouted and the board showed move tiles that couldn't be commanded. Keyed on
	// team+turn so it fires once per handoff, never mid-turn.
	let lastInteractionTurnKey = ''
	$effect(() => {
		if (!map) return
		const key = `${$gameState.currentTeam}:${$gameState.turnNumber}`
		if (key !== lastInteractionTurnKey) {
			lastInteractionTurnKey = key
			resetInteraction(map)
		}
	})

	// The turn the End Turn button offers to end: only ever this client's own side.
	// Online this used to be ungated (the button's old `cpuOpponent` flag was false
	// for every socket match), so pressing it on the OPPONENT's turn ran the local
	// end-turn, flipped this board to the next side, and got the relay refused
	// server-side — leaving the two clients on different turns and every later
	// action answered with 'Not your turn'.
	const canEndTurn = $derived($gameState.currentTeam === localTeam)

	// Which side this client is allowed to commit actions for at all — its own
	// seat, plus (online) a CPU seat it drives. See `turnOwnership.ts`: the rule
	// is the server's, kept in one place so the two can't drift.
	const controlsCurrentTeam = $derived(
		controlsTeam({
			team: $gameState.currentTeam,
			localTeam,
			isMultiplayer,
			isAiDriver,
			aiTeams,
		})
	)

	const handleEndTurn = () => {
		// Never end a turn this client doesn't own. Every end-turn applies to the
		// local board immediately and is only then relayed, so a stray call (a
		// mis-enabled control, a watchdog firing after the turn already moved on)
		// desyncs the match rather than doing nothing. The gate belongs here, on the
		// one funnel every caller goes through, not on each button.
		if (!controlsCurrentTeam) return
		// Frozen after a detected desync: this client's board no longer matches the
		// room, so ending "its" turn would hand the opponent a turn the server never
		// agreed had ended. See `desync.ts`.
		if ($syncLocked) return
		if (endTurnAction) {
			endTurnAction()
			return
		}
		// Local/campaign end-turn (no socket): route through `applyAction` live so the
		// turn and any auto-captures are credited to match stats, just like the socket
		// path. Calling `endTurn` directly bypasses the stat sink and left the Turns and
		// Captures columns stuck at 0 on the results screen.
		if (map) {
			applyAction(map, { kind: 'end-turn' }, { live: true })
			return
		}
		endTurn({ map })
	}

	// Rematch. Online: spin up (or join) a fresh lobby for the same map and send
	// the player there, so the old opponents aren't required to return — each
	// player who hits rematch lands in the same new room. Hotseat/campaign: replay
	// the same board in place (restore the pre-match snapshot, re-seed, clear the
	// J1/J2 trackers so a new match-end can fire and re-count).
	const handleRematch = async () => {
		if (isMultiplayer && gameSession) {
			try {
				const res = await fetch(`/api/game/${gameSession}/rematch`, { method: 'POST' })
				const body = (await res.json().catch(() => null)) as { session?: string } | null
				if (res.ok && body?.session) {
					await goto(`/rooms/${body.session}`)
					return
				}
			} catch {
				// Fall through to an in-place restart if the rematch lobby couldn't be set up.
			}
		}
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
		resetDevLog(localTeam)
	}

	// `$turnTransitionActive` is part of the key so the CPU only starts thinking
	// after the slide-in/slide-out overlay finishes. While the transition is up,
	// the key collapses to '' and any in-flight handle is cancelled; when the
	// flag flips back to false the block re-fires with the real key and a fresh
	// `runCpuTurn` is scheduled.
	let cpuHandle: CpuAiHandle | null = null
	let lastCpuKey = ''
	$effect(() => {
		const s = $gameState
		// Hold the CPU off while a campaign block runs, the same way as the turn
		// transition: the gate collapses the key to '' (cancelling any in-flight
		// handle), and when the block ends the block re-fires and schedules the turn.
		const blocked = $turnTransitionActive || $campaignScriptActive
		// Single-player: drive every non-local team. Online: only the designated
		// driver runs CPU seats, and only for the teams that are actually CPUs.
		const isCpu =
			s.phase === 'playing' &&
			(!isMultiplayer ? s.currentTeam !== localTeam : isAiDriver && aiTeams.includes(s.currentTeam))
		const key = isCpu && !blocked ? `${s.currentTeam}:${s.turnNumber}` : ''
		if (key !== lastCpuKey) {
			lastCpuKey = key
			if (cpuHandle) {
				cpuHandle.cancel()
				cpuHandle = null
			}
			if (isCpu && !blocked && map) {
				cpuHandle = runCpuTurn({
					humanTeam: localTeam,
					endTurn: handleEndTurn,
					map,
				})
			}
		}
	})

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
	$effect(() => {
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
			$interactionSource === null &&
			// A running campaign block leaves the engine "idle" (its talk/wait pauses
			// aren't engine animations), so without this guard the turn would auto-end
			// out from under a script playing at the start of the player's turn.
			!$campaignScriptActive
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
	})

	// --- Online turn timeout (anti-stall) ---------------------------------------
	// Only in online multiplayer: a human who sits idle (or leaves) would freeze
	// the match for everyone, so their turn auto-ends after TURN_TIMEOUT_MS. Any
	// committed action refreshes the clock; a countdown warns near the end.
	let turnExpiresAt = $state(0)
	let turnNow = $state(0)
	let turnTimer: ReturnType<typeof setInterval> | null = null
	let timedOutTurnKey = ''
	let armedTurnKey = ''
	let outgoingResetUnsub: (() => void) | null = null

	const myOnlineTurn = $derived(
		isMultiplayer && $gameState.phase === 'playing' && $gameState.currentTeam === localTeam
	)
	// A CPU side this client is the designated driver for — the turn the watchdog
	// above covers. Mirrors the gate the CPU effect itself runs on.
	const drivenAiTurn = $derived(
		isMultiplayer &&
			isAiDriver &&
			$gameState.phase === 'playing' &&
			aiTeams.includes($gameState.currentTeam)
	)
	const turnSecondsLeft = $derived(
		turnExpiresAt ? Math.max(0, Math.ceil((turnExpiresAt - turnNow) / 1000)) : 0
	)

	// (Re)arm the deadline the moment a turn this client is responsible for begins —
	// my own, or a CPU side I drive. The two are mutually exclusive (a CPU seat is
	// never `localTeam`), so one clock serves both with its own allowance.
	$effect(() => {
		const watched = myOnlineTurn || drivenAiTurn
		const key = watched ? `${$gameState.currentTeam}:${$gameState.turnNumber}` : ''
		if (key !== armedTurnKey) {
			armedTurnKey = key
			turnExpiresAt =
				key && typeof window !== 'undefined'
					? Date.now() + (myOnlineTurn ? TURN_TIMEOUT_MS : AI_STALL_TIMEOUT_MS)
					: 0
		}
	})

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
			// Stable per-match seed. It picks both the pack and the arrangement
			// order, so a replay hears the same music the live match did instead of
			// rolling fresh. The phrase length comes from whichever pack this seed
			// lands on, so there is nothing to keep in sync by hand.
			seed: seedFromString(gameSession || campaignLevelId || 'local'),
		})
		musicDirector.start()

		// Any committed action from this client (not the end-turn itself) refreshes the
		// timeout — the CPU's relayed moves count, so a long but healthy AI turn keeps
		// resetting its own watchdog and only a genuinely stuck one runs the clock out.
		outgoingResetUnsub = outgoingActions.subscribe((action) => {
			if (!action || action.kind === 'end-turn') return
			if (myOnlineTurn) turnExpiresAt = Date.now() + TURN_TIMEOUT_MS
			else if (drivenAiTurn) turnExpiresAt = Date.now() + AI_STALL_TIMEOUT_MS
		})
		// Tick the countdown and fire the auto-end once past the deadline.
		turnTimer = setInterval(() => {
			turnNow = Date.now()
			if (
				(myOnlineTurn || drivenAiTurn) &&
				turnExpiresAt &&
				turnNow >= turnExpiresAt &&
				timedOutTurnKey !== armedTurnKey
			) {
				timedOutTurnKey = armedTurnKey
				// Stop the wedged planner before handing the turn on, so a tick that
				// later comes back to life can't commit into someone else's turn.
				if (cpuHandle) {
					cpuHandle.cancel()
					cpuHandle = null
				}
				handleEndTurn()
			}
		}, 500)

		return () => {
			musicDirector?.stop()
			musicDirector = null
		}
	})

	onDestroy(() => {
		if (cpuHandle) cpuHandle.cancel()
		if (autoEndTimer) clearTimeout(autoEndTimer)
		if (turnTimer) clearInterval(turnTimer)
		if (outgoingResetUnsub) outgoingResetUnsub()
		weatherAudio.clear()
		offRecordMatch?.()
		offCampaignProgress?.()
	})
</script>

{@render children?.({ select })}

{#if myOnlineTurn && turnSecondsLeft > 0 && turnSecondsLeft <= TURN_WARN_SECONDS}
	<div
		class="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none rounded-full px-4 py-2 text-sm font-semibold shadow-lg"
		class:bg-amber-500={turnSecondsLeft > 5}
		class:bg-red-600={turnSecondsLeft <= 5}
		class:text-white={true}
		data-testid="turn-timeout-warning"
	>
		Your turn ends in {turnSecondsLeft}s
	</div>
{/if}

<HUDRoot {map} {minimap} {fogOfWar} onEndTurn={handleEndTurn} {localTeam} {canEndTurn} />
<BuildMenu {map} />
<ActionMenu {map} />
<StatsScreen {localTeam} onRematch={handleRematch} {onContinue} {onRetry} {campaignHref} />
<TurnTransition {localTeam} cpuOpponent={!isMultiplayer} />
