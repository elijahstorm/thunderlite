<script lang="ts">
	import Scroller from '$lib/Scroller/Scroller.svelte'
	import Animator from '$lib/Engine/Animator/Animator.svelte'
	import TileSelector from '$lib/Layers/TileSelector.svelte'
	import Game from '$lib/Engine/Game.svelte'
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'
	import { paint, type VisibilityProvider } from '$lib/Engine/paint'
	import { canSelectUnit, gameState } from '$lib/Engine/gameState'
	import { buildingData } from '$lib/GameData/building'
	import { computeTeamVisibility } from '$lib/Engine/visibility'
	import { onDestroy, onMount, tick } from 'svelte'
	import {
		animationFrame,
		startAnimationClock,
		stopAnimationClock,
	} from '$lib/Sprites/animationFrameCount'
	import { connectionDecision, cornerDecision } from '$lib/Sprites/spriteConnector'
	import { imageColorizer } from '$lib/Sprites/imageColorizer'
	import { createImageLoader } from '$lib/Sprites/images'
	import { writable, get } from 'svelte/store'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { updateRoute } from '$lib/Layers/tileHighlighter'
	import { interactionSource, interactionState } from '$lib/Engine/Interactor/interactionState'
	import { fogOfWarEnabled, viewerVisibility } from '$lib/Engine/fogState'
	import { fogBusy, unitFadeBusy } from '$lib/Engine/fogRender'
	import { shownThreatUnits, computeShownThreatTiles } from '$lib/Engine/threatOverlay'
	import { setHoverTile } from '$lib/Engine/uiState'
	import { dev } from '$app/environment'
	import { analyzePathDebug, pathDebugEnabled } from '$lib/Engine/Interactor/Pathing/pathDebug'
	import {
		ANIMATION_TIME,
		OVERLAY_ANIMATION_TIME,
		routeAnimation,
		animations,
		repaintSignal,
	} from '$lib/Engine/Animator/animator'
	import type { CutsceneScript } from '$lib/Campaign/cutsceneTypes'
	import { campaignCamera } from '$lib/Campaign/campaignInterface'

	export let map: MapObject
	/** When set, this board is a scripted campaign level; forwarded to `Game`,
	 * which drives the K1 script (dialogue, camera, spawns) against the engine. */
	export let campaign: CutsceneScript | undefined = undefined
	export let mini: boolean = false
	export let pause = false
	/** Map-editor mode: suppresses gameplay-only overlays (the tile-selector
	 * animation and the hover "selectable unit" icon) that have no meaning while
	 * authoring a map. */
	export let editor = false
	export let fogOfWar: boolean = false
	/** Team whose fog-of-war perspective is drawn. Always the local viewer — never
	 * the active turn's team — so an opponent's/CPU's turn never reveals their
	 * units to us. */
	export let localTeam: number = 0
	export let requestRedraw = 0
	export let backdrop = 'bg-yellow-300'
	export let hud = {
		advice: '/game/play/icon/move/advice.png',
		arrow: '/game/play/icon/route/arrow.png',
	}

	export let contextLoaded = writable(!!$rendererStore.ground[0]?.sprite)
	export let makeImage = createImageLoader((finished: boolean) => ($contextLoaded = finished))
	export let colorizer: ReturnType<typeof imageColorizer> | undefined = undefined
	export let scroller = Scroller
	export let animator = Animator
	export let select: ((x: number, y: number) => void) | undefined = undefined

	const render = () => (requestRedraw = performance.now())

	// The fog veil eases in/out per tile (see fogRender), but the board's normal
	// repaint cadence is the 200ms sprite tick — far too coarse for a smooth fade.
	// While fog is in motion, pump extra repaints via requestAnimationFrame. It
	// runs for one frame to let the new visibility targets register through paint,
	// then keeps going only while a fade is still in flight, and stops itself —
	// so there's no permanent rAF loop burning cycles on a settled board.
	let fogRaf = 0
	const pumpFog = () => {
		if (typeof requestAnimationFrame === 'undefined') return
		cancelAnimationFrame(fogRaf)
		const start = performance.now()
		const step = () => {
			render()
			if (performance.now() - start < 120 || fogBusy() || unitFadeBusy()) {
				fogRaf = requestAnimationFrame(step)
			} else {
				fogRaf = 0
			}
		}
		fogRaf = requestAnimationFrame(step)
	}

	let cachedVisibility: {
		team: number
		turnNumber: number
		tile: number
		visible: Set<number>
	} | null = null

	// Fog is driven by the `fogOfWarEnabled` store (the single source of truth),
	// not the `fogOfWar` prop directly, so a scripted `fog: on/off` command can
	// toggle it live. The compute path is always available; the store gates it.
	const computeVisibility = (): { visible: Set<number>; team: number } | null => {
		const state = $gameState
		// Lift the fog entirely once the local player is eliminated or the
		// match is decided: sight comes only from owned units, so a dead
		// viewer would otherwise stare at a fully black board while the
		// remaining teams play out the match. Spectating is the better rule.
		const localPlayer = state.players.find((p) => p.team === localTeam)
		if (state.phase === 'gameOver' || localPlayer?.hasLost) return null
		// Viewer's team, not state.currentTeam: the active player switching to
		// the CPU/opponent must not flip the fog to their vantage point. The
		// cache still keys on turn + actedTiles so our view refreshes as their
		// units move in and out of our sight.
		const team = localTeam
		if (
			!cachedVisibility ||
			cachedVisibility.team !== team ||
			cachedVisibility.turnNumber !== state.turnNumber ||
			cachedVisibility.tile !== state.actedTiles.size
		) {
			cachedVisibility = {
				team,
				turnNumber: state.turnNumber,
				tile: state.actedTiles.size,
				visible: computeTeamVisibility(map, team),
			}
		}
		return { visible: cachedVisibility.visible, team }
	}

	const visibilityProvider: VisibilityProvider = () =>
		get(fogOfWarEnabled) ? computeVisibility() : null

	$: if ($fogOfWarEnabled) {
		// invalidate cache when units move or turn changes
		$gameState
		cachedVisibility = null
	}

	// Visibility just shifted (a unit moved, the turn changed, or fog toggled):
	// kick the fade pump so tiles animate to their new covered/visible state, and
	// cloaked-unit opacity eases in/out. Not gated on fog — stealth units fade
	// even with fog off — and the pump self-terminates once nothing is mid-fade.
	$: {
		$gameState
		$fogOfWarEnabled
		pumpFog()
	}

	// Engine code (attack list, AI, threat reach) consults `fogOfWarEnabled` to
	// decide whether to apply the team-visibility filter. Sync it whenever this
	// board's fog prop changes so a freshly-mounted campaign board doesn't carry
	// over a stale "on" value from a prior online match. A scripted `fog:`
	// command writes the same store afterwards, and this never re-fires to clobber
	// it because the `fogOfWar` prop itself doesn't change mid-match.
	$: fogOfWarEnabled.set(fogOfWar)

	// Mirror the viewer's visibility snapshot into a global store so the DOM
	// Animator (walking/attack/explosion overlays) can hide animations whose
	// source tile is in fog. Depends on $gameState (units act) and
	// $fogOfWarEnabled (live fog toggles) so both refresh the mask.
	$: {
		$gameState
		viewerVisibility.set($fogOfWarEnabled ? visibilityProvider() : null)
	}

	// Persistent enemy-threat overlay. Recompute the painted tiles whenever the
	// player toggles units on/off, a unit acts/moves/dies ($gameState), or fog
	// shifts what's visible — then request a redraw. Gameplay boards only: the
	// minimap and editor never show it.
	$: if (!mini && !editor) {
		$shownThreatUnits
		$gameState
		$fogOfWarEnabled
		map.threatTiles = computeShownThreatTiles(map, $shownThreatUnits)
		render()
	}

	// @ts-ignore
	let hudImages: HUDImages = {}

	const hover = (x: number, y: number) => {
		const tile = y * map.cols + x
		if (!mini) setHoverTile(tile)
		// Movement arrows only make sense while the player is choosing a move
		// destination. Once they've committed to an action like attacking (e.g. a
		// long-range unit picking a target), the unit isn't moving, so suppress the
		// route preview rather than drawing a stale path over the move tiles.
		if ($interactionState !== 'choice') {
			// The directional build picker owns map.route while it's up (the outward
			// arrows aren't hover-driven), so leave it intact in that state only.
			if ($interactionState !== 'selectBuildTile') map.route = []
			// DEV TOOL — live path/move diagnostics (PathDebugPanel). dev-only.
			if (dev && !mini && get(pathDebugEnabled)) analyzePathDebug(map, get(interactionSource), tile)
			return
		}
		const result = updateRoute(map, $interactionSource, map.pathHistory ?? [], tile)
		map.pathHistory = result.pathHistory
		map.route = result.route
		// DEV TOOL — snapshot AFTER the live route is built so the panel sees the
		// real traced pathHistory / arrows, not pathFinder's recomputation.
		if (dev && !mini && get(pathDebugEnabled)) analyzePathDebug(map, get(interactionSource), tile)
	}

	const canSelectAt = (x: number, y: number): boolean => {
		if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return false
		const tile = y * map.cols + x
		const state = $gameState
		if (state.phase !== 'playing') return false
		const unit = map.layers.units[tile]
		if (unit) return canSelectUnit(unit, tile, state)
		const building = map.layers.buildings[tile]
		if (building) {
			if (!buildingData[building.type]?.actable) return false
			if (building.team !== state.currentTeam) return false
			if (state.actedTiles.has(tile)) return false
			return true
		}
		return false
	}

	// Repaint this board on every global animation tick (idle unit cycling,
	// selectable-unit pulse, movement steps). The tick itself is a process-wide
	// singleton owned by the animation clock (see animationFrameCount); here we
	// only react to the counter it advances. Paused boards (the minimap) hold a
	// static frame, so they skip the per-frame repaint. The combat-overlay clock
	// (`overlayFrame`) drives the DOM Animator reactively and needs no canvas
	// repaint, so it isn't mirrored here.
	$: if (!pause) {
		$animationFrame
		render()
	}

	// Resizing the map (editor "Map options") feeds the canvas through two
	// independent reactive paths: the viewport size flows straight from `map.cols`
	// into the Scroller, while the tile data arrives later through the
	// Game/TileSelector slot chain. The canvas can therefore paint once before the
	// new ground array has propagated, leaving stale tiles inside a correctly-sized
	// viewport (visible when growing the map; clipped — and so unnoticed — when
	// shrinking). Force one more redraw after the DOM settles so the two agree.
	let lastDimensions = ''
	$: {
		const dimensions = `${map.cols}x${map.rows}`
		if (dimensions !== lastDimensions) {
			lastDimensions = dimensions
			tick().then(render)
		}
	}

	$: {
		$animations
		$routeAnimation
		// Bumped per frame by health-bar eases (animateHealthBar) so each step of the
		// slide repaints, not just the coarse 200ms idle tick.
		$repaintSignal
		map.layers.ground.forEach((object, index) => {
			object.state = connectionDecision(object)(map, index)
			object.corners = cornerDecision(object)(map, index)
		})
		render()
	}

	// Hold a reference on the global animation clock while this board is unpaused.
	// `clockHeld` tracks our own one-and-only reference so the ref count stays
	// balanced even if `pause` toggles at runtime: we acquire on the false edge,
	// release on the true edge, and release once on destroy. The clock itself is
	// a singleton, so this never starts a second tick chain.
	let clockHeld = false
	$: {
		if (!pause && !clockHeld) {
			startAnimationClock(ANIMATION_TIME, OVERLAY_ANIMATION_TIME)
			clockHeld = true
		} else if (pause && clockHeld) {
			stopAnimationClock()
			clockHeld = false
		}
	}

	// Bound to the live `<svelte:component>` so we can call `panToTile` on it
	// when the campaign script asks the camera to move. Minimap MapRenders also
	// run this binding, but they never get a `campaign` prop so the subscription
	// below short-circuits and they don't pan with the main board.
	let scrollerInstance:
		| { panToTile?: (x: number, y: number, animate?: boolean) => void }
		| undefined

	onMount(() => {
		if (!colorizer) colorizer = imageColorizer()

		hudImages.advice.src = hud.advice
		hudImages.arrow.src = hud.arrow

		if (!campaign) return
		// `move: x,y` in a campaign script publishes here. Skip the initial
		// `null` and bring `(x, y)` into view (centred, clamped to map bounds).
		return campaignCamera.subscribe((pos) => {
			if (!pos) return
			scrollerInstance?.panToTile?.(pos.x, pos.y)
		})
	})

	onDestroy(() => {
		if (clockHeld) {
			stopAnimationClock()
			clockHeld = false
		}
		if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(fogRaf)
	})
</script>

<div class="w-full h-full flex justify-center items-center {backdrop}">
	{#if colorizer}
		<Game
			{map}
			{makeImage}
			{colorizer}
			{select}
			{campaign}
			let:interfacer
			let:renderData
			let:select
			let:validTile
		>
			{#if $contextLoaded}
				<TileSelector
					{animator}
					{mini}
					{editor}
					{interfacer}
					{select}
					{validTile}
					{canSelectAt}
					{hover}
					let:cellWidth
					let:cellHeight
					let:handleClick
					let:handleHover
					let:handleKeypress
					let:handleOffset
				>
					<div
						class="w-full h-full"
						style={mini
							? `max-width: ${map.cols * cellWidth}px; max-height: ${map.rows * cellHeight}px`
							: ''}
					>
						<svelte:component
							this={scroller}
							bind:this={scrollerInstance}
							tileWidth={cellWidth}
							tileHeight={cellHeight}
							contentWidth={cellWidth * map.cols}
							contentHeight={cellHeight * map.rows}
							paint={paint(renderData, hudImages, pause, visibilityProvider, localTeam, editor)(() => map)}
							{requestRedraw}
							{handleClick}
							{handleHover}
							{handleKeypress}
							{handleOffset}
						/>
					</div>
				</TileSelector>
			{:else}
				<Loader />
			{/if}
		</Game>
	{/if}
</div>

<img class="hidden" bind:this={hudImages.arrow} src={hud.arrow} alt="placeholder arrow" />
<img class="hidden" bind:this={hudImages.advice} src={hud.advice} alt="placeholder advice" />
