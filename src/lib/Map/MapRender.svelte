<script lang="ts">
	import Scroller from '$lib/Scroller/Scroller.svelte'
	import Animator from '$lib/Engine/Animator/Animator.svelte'
	import TileSelector from '$lib/Layers/TileSelector.svelte'
	import Game from '$lib/Engine/Game.svelte'
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'
	import { paint, flushDeferredOverlays, type VisibilityProvider } from '$lib/Engine/paint'
	import { canSelectUnit, gameState } from '$lib/Engine/gameState'
	import { buildingData } from '$lib/GameData/building'
	import {
		computeTeamVisibility,
		computeTeamAirVisibility,
		computeRadarTiles,
		isUnitStealthed,
		unitSeenByViewer,
		type ViewerFog,
	} from '$lib/Engine/visibility'
	import { onDestroy, onMount, tick } from 'svelte'
	import {
		animationFrame,
		startAnimationClock,
		stopAnimationClock,
	} from '$lib/Sprites/animationFrameCount'
	import {
		connectionDecision,
		cornerDecision,
		seaUnderlayDecision,
		skyConnectionDecision,
		variantDecision,
		skyFlowReversed,
	} from '$lib/Sprites/spriteConnector'
	import { imageColorizer } from '$lib/Sprites/imageColorizer'
	import { createImageLoader } from '$lib/Sprites/images'
	import { writable, get } from 'svelte/store'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { updateRoute } from '$lib/Layers/tileHighlighter'
	import { splashPreviewForHover } from '$lib/Engine/aoePreview'
	import { interactionSource, interactionState } from '$lib/Engine/Interactor/interactionState'
	import { fogOfWarEnabled, viewerVisibility } from '$lib/Engine/fogState'
	import { fogBusy, unitFadeBusy, createFadeScope } from '$lib/Engine/fogRender'
	import { materializeBusy, materializeSignal } from '$lib/Engine/materialize'
	import { buildFadeBusy } from '$lib/Engine/buildFade'
	import {
		shownThreatUnits,
		threatOverlayRevision,
		pruneThreatOverlay,
		computeShownThreatTiles,
		computeShownThreatUnitTiles,
	} from '$lib/Engine/threatOverlay'
	import { setHoverTile } from '$lib/Engine/uiState'
	import { hudGutter } from '$lib/Engine/HUD/hudInsets'
	import { dev } from '$app/environment'
	import { analyzePathDebug, pathDebugEnabled } from '$lib/Engine/Interactor/Pathing/pathDebug'
	import {
		ANIMATION_TIME,
		OVERLAY_ANIMATION_TIME,
		routeAnimation,
		animations,
		repaintSignal,
		boardBusy,
		setRouteCamera,
		clearRouteCamera,
		type RouteCamera,
	} from '$lib/Engine/Animator/animator'
	import type { CutsceneScript } from '$lib/Campaign/cutsceneTypes'
	import { campaignCamera } from '$lib/Campaign/campaignInterface'

	interface Props {
		map: MapObject
		/** When set, this board is a scripted campaign level; forwarded to `Game`,
		 * which drives the K1 script (dialogue, camera, spawns) against the engine. */
		campaign?: CutsceneScript | undefined
		mini?: boolean
		/** Cell size in px for a `mini` board, so the HUD rail can fit a whole map
		 * into its width instead of cropping it. */
		miniCell?: number
		pause?: boolean
		/** Map-editor mode: suppresses gameplay-only overlays (the tile-selector
		 * animation and the hover "selectable unit" icon) that have no meaning while
		 * authoring a map. */
		editor?: boolean
		fogOfWar?: boolean
		/** Team whose fog-of-war perspective is drawn. Always the local viewer — never
		 * the active turn's team — so an opponent's/CPU's turn never reveals their
		 * units to us. */
		localTeam?: number
		requestRedraw?: number
		backdrop?: string
		hud?: any
		contextLoaded?: any
		makeImage?: any
		colorizer?: ReturnType<typeof imageColorizer> | undefined
		scroller?: any
		animator?: any
		select?: ((x: number, y: number) => void) | undefined
	}

	let {
		map = $bindable(),
		campaign = undefined,
		mini = false,
		miniCell = 20,
		pause = false,
		editor = false,
		fogOfWar = false,
		localTeam = 0,
		requestRedraw = $bindable(0),
		backdrop = 'bg-yellow-300',
		hud = {
			advice: '/game/play/icon/move/advice.png',
			arrow: '/game/play/icon/route/arrow.png',
		},
		contextLoaded = writable(!!$rendererStore.ground[0]?.sprite),
		makeImage = createImageLoader((finished: boolean) => ($contextLoaded = finished)),
		colorizer = $bindable(undefined),
		scroller = Scroller,
		animator = Animator,
		select = undefined,
	}: Props = $props()

	const render = () => (requestRedraw = performance.now())

	// Room the runtime HUD rail occupies on the right edge. The live gameplay board
	// pads itself by that much so the rail sits *beside* the map rather than on top
	// of it — tiles under a floating panel can't be clicked, because the panel gets
	// the pointer event. The backdrop still paints across the padding, so the rail
	// keeps the same framed background behind it. Minimaps and the editor have no
	// HUD, so they never inset.
	let gutter = $derived(!mini && !editor ? $hudGutter : 0)

	// The fog veil eases in/out per tile (see fogRender), but the board's normal
	// repaint cadence is the 200ms sprite tick — far too coarse for a smooth fade.
	// While fog is in motion, pump extra repaints via requestAnimationFrame. It
	// runs for one frame to let the new visibility targets register through paint,
	// then keeps going only while a fade is still in flight, and stops itself —
	// so there's no permanent rAF loop burning cycles on a settled board.
	// This board's own fog/unit fade state (see fogRender). Never shared with the
	// other board on screen: the HUD rail's overview map and the gameplay board
	// paint the same tile indices, so one shared easing store had them overwriting
	// each other's targets every frame.
	const fadeScope = createFadeScope()

	let fogRaf = 0
	const pumpFog = () => {
		if (typeof requestAnimationFrame === 'undefined') return
		cancelAnimationFrame(fogRaf)
		const start = performance.now()
		const step = () => {
			render()
			if (
				performance.now() - start < 120 ||
				fogBusy(fadeScope) ||
				unitFadeBusy(fadeScope) ||
				materializeBusy() ||
				buildFadeBusy()
			) {
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
		airVisible: Set<number>
	} | null = $state(null)

	// Fog is driven by the `fogOfWarEnabled` store (the single source of truth),
	// not the `fogOfWar` prop directly, so a scripted `fog: on/off` command can
	// toggle it live. The compute path is always available; the store gates it.
	const computeVisibility = (): ViewerFog | null => {
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
				// The wider raw-reach set that spots airborne occupants over canopy /
				// behind ridges (see unitSeenByViewer).
				airVisible: computeTeamAirVisibility(map, team),
			}
		}
		return { visible: cachedVisibility.visible, airVisible: cachedVisibility.airVisible, team }
	}

	const visibilityProvider: VisibilityProvider = () =>
		get(fogOfWarEnabled) ? computeVisibility() : null

	$effect.pre(() => {
		if ($fogOfWarEnabled) {
			// invalidate cache when units move or turn changes
			$gameState
			cachedVisibility = null
		}
	})

	// Visibility just shifted (a unit moved, the turn changed, or fog toggled):
	// kick the fade pump so tiles animate to their new covered/visible state, and
	// cloaked-unit opacity eases in/out. Not gated on fog — stealth units fade
	// even with fog off — and the pump self-terminates once nothing is mid-fade.
	$effect(() => {
		$gameState
		$fogOfWarEnabled
		// A scripted spawn/terrain change bumps this when it begins its pixel
		// assemble; kick the same pump so those effects animate too.
		$materializeSignal
		pumpFog()
	})

	// Engine code (attack list, AI, threat reach) consults `fogOfWarEnabled` to
	// decide whether to apply the team-visibility filter. Sync it whenever this
	// board's fog prop changes so a freshly-mounted campaign board doesn't carry
	// over a stale "on" value from a prior online match. A scripted `fog:`
	// command writes the same store afterwards, and this never re-fires to clobber
	// it because the `fogOfWar` prop itself doesn't change mid-match.
	//
	// Primary boards only. A mini board is a companion to a real one, and these
	// globals describe *the* match — a secondary board writing them just races the
	// board that owns them.
	$effect.pre(() => {
		if (mini) return
		fogOfWarEnabled.set(fogOfWar)
	})

	// Mirror the viewer's visibility snapshot into a global store so the DOM
	// Animator (walking/attack/explosion overlays) can hide animations whose
	// source tile is in fog. Depends on $gameState (units act) and
	// $fogOfWarEnabled (live fog toggles) so both refresh the mask. Primary board
	// only — the overlay belongs to the gameplay board, so letting the minimap
	// write here published *its* viewer's reach and leaked enemy animations.
	$effect.pre(() => {
		$gameState
		if (mini) return
		viewerVisibility.set($fogOfWarEnabled ? visibilityProvider() : null)
	})

	// Persistent enemy-threat overlay. Recompute the painted tiles whenever the
	// player toggles units on/off, a unit acts/moves/dies ($gameState), a campaign
	// script mutates the board behind the engine's back ($threatOverlayRevision), or
	// fog shifts what's visible — then request a redraw. Gameplay boards only: the
	// minimap and editor never show it.
	//
	// The revision dependency is what keeps the overlay honest across scripted
	// spawns and kills: those never touch `gameState`, so without it these tile sets
	// stayed frozen at whatever the board looked like before the script ran, and the
	// source-unit outline went on framing a tile whose original occupant was dead —
	// reading as the overlay having switched to a different unit.
	$effect.pre(() => {
		if (!mini && !editor) {
			$shownThreatUnits
			$gameState
			$fogOfWarEnabled
			$threatOverlayRevision
			// Drop units that have left the board before painting, so the settings
			// panel's "on" state matches what's actually drawn. Re-read the store
			// afterwards rather than reusing the captured value: this pass should paint
			// the pruned set, not wait for the write to schedule another one.
			pruneThreatOverlay(map)
			const shown = get(shownThreatUnits)
			map.threatTiles = computeShownThreatTiles(map, shown)
			map.threatUnitTiles = computeShownThreatUnitTiles(map, shown)
			render()
		}
	})

	// Jammer Truck radar rings: our own net always, plus any enemy jammer we can
	// see. Recompute on the same triggers as the threat overlay — a jammer moving,
	// the turn flipping, or fog toggling all shift where the rings fall. The enemy
	// rings are gated by the viewer's fog reach so a jammer hidden in fog leaks none.
	$effect.pre(() => {
		if (!mini && !editor) {
			$gameState
			$fogOfWarEnabled
			map.radarTiles = computeRadarTiles(
				map,
				localTeam,
				$fogOfWarEnabled ? (visibilityProvider()?.visible ?? null) : null
			)
			render()
		}
	})

	// @ts-ignore
	let hudImages: HUDImages = $state({})

	const hover = (x: number, y: number) => {
		// The previous action's movement/attack animations are still playing — don't
		// move the hover marker or redraw route-preview arrows over a board that's
		// mid-animation. Matches the click gate in GameStateManager.
		if (!mini && $boardBusy) return
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
			map.splashPreview = undefined
			// DEV TOOL — live path/move diagnostics (PathDebugPanel). dev-only.
			if (dev && !mini && get(pathDebugEnabled)) analyzePathDebug(map, get(interactionSource), tile)
			// `map` mutations aren't reactive (plain object in-game / $state.raw), so the
			// canvas won't repaint on its own. Legacy relied on Svelte 3/4 member-mutation
			// reactivity here; in runes we request the redraw explicitly so the hover
			// marker / route arrows track the cursor instead of the 200ms idle clock.
			render()
			return
		}
		const result = updateRoute(map, $interactionSource, map.pathHistory ?? [], tile)
		map.pathHistory = result.pathHistory
		map.route = result.route
		// Blast footprint for a splash/lance shot the cursor is lining up: the tiles
		// the wash/passthrough would also hit, painted red so the player sees the area
		// of effect before committing.
		map.splashPreview = splashPreviewForHover(map, $interactionSource, result.pathHistory, tile)
		// DEV TOOL — snapshot AFTER the live route is built so the panel sees the
		// real traced pathHistory / arrows, not pathFinder's recomputation.
		if (dev && !mini && get(pathDebugEnabled)) analyzePathDebug(map, get(interactionSource), tile)
		// Repaint now (see note above) so the route-preview arrows follow the cursor.
		render()
	}

	const canSelectAt = (x: number, y: number): boolean => {
		if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return false
		const tile = y * map.cols + x
		const state = $gameState
		if (state.phase !== 'playing') return false
		// The hover marker is a "you can act on this" cue, so it must track the
		// viewing player, not whoever's turn it is. On an opponent's turn their
		// un-acted units are still selectable by the turn's rules — painting the
		// marker on them under fog handed the player a cursor to sweep for hidden
		// enemies. Only the local player ever selects on this board (non-local
		// teams are CPU), so gate the cue to our own turn.
		if (state.currentTeam !== localTeam) return false
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
	$effect(() => {
		if (!pause) {
			$animationFrame
			render()
		}
	})

	// Resizing the map (editor "Map options") feeds the canvas through two
	// independent reactive paths: the viewport size flows straight from `map.cols`
	// into the Scroller, while the tile data arrives later through the
	// Game/TileSelector slot chain. The canvas can therefore paint once before the
	// new ground array has propagated, leaving stale tiles inside a correctly-sized
	// viewport (visible when growing the map; clipped — and so unnoticed — when
	// shrinking). Force one more redraw after the DOM settles so the two agree.
	let lastDimensions = $state('')
	$effect(() => {
		const dimensions = `${map.cols}x${map.rows}`
		if (dimensions !== lastDimensions) {
			lastDimensions = dimensions
			tick().then(render)
		}
	})

	$effect.pre(() => {
		$animations
		$routeAnimation
		// Bumped per frame by health-bar eases (animateHealthBar) so each step of the
		// slide repaints, not just the coarse 200ms idle tick.
		$repaintSignal
		map.layers.ground.forEach((object, index) => {
			object.state = connectionDecision(object)(map, index)
			object.corners = cornerDecision(object)(map, index)
			// Which stretch of coast (or other multi-variant terrain) this tile wears.
			object.variant = variantDecision(object)(map, index)
			// Singular ocean obstacles (Reef / Archipelago / Rock Formation) that touch
			// land get a Sea coastline drawn beneath them; paint reads these two hints to
			// composite the shore and shrink the obstacle. Undefined everywhere else.
			const underlay = seaUnderlayDecision(object)(map, index)
			object.seaState = underlay?.state
			object.seaCorners = underlay?.corners
		})
		// Weather autotiles too: the Jetstream picks a directional frame from its
		// same-type sky neighbours so a run of tiles flows as one connected highway
		// (turns, verticals and junctions), instead of every tile drawing the same
		// horizontal streak. Recomputed each pass so scripted weather shifts retile.
		map.layers.sky.forEach((object, index) => {
			if (!object) return
			object.state = skyConnectionDecision(object)(map, index)
			object.flowReversed = skyFlowReversed(object)(map, index)
		})
		render()
	})

	// Hold a reference on the global animation clock while this board is unpaused.
	// `clockHeld` tracks our own one-and-only reference so the ref count stays
	// balanced even if `pause` toggles at runtime: we acquire on the false edge,
	// release on the true edge, and release once on destroy. The clock itself is
	// a singleton, so this never starts a second tick chain.
	let clockHeld = $state(false)
	$effect(() => {
		if (!pause && !clockHeld) {
			startAnimationClock(ANIMATION_TIME, OVERLAY_ANIMATION_TIME)
			clockHeld = true
		} else if (pause && clockHeld) {
			stopAnimationClock()
			clockHeld = false
		}
	})

	// Bound to the live `<svelte:component>` so we can call `panToTile` on it
	// when the campaign script asks the camera to move. Minimap MapRenders also
	// run this binding, but they never get a `campaign` prop so the subscription
	// below short-circuits and they don't pan with the main board.
	let scrollerInstance:
		| {
				panToTile?: (x: number, y: number, animate?: boolean) => void
				viewport?: () => {
					left: number
					top: number
					width: number
					height: number
					tileWidth: number
					tileHeight: number
				} | null
				scrollToPx?: (
					left: number,
					top: number,
					animate?: boolean
				) => { left: number; top: number } | null
		  }
		| undefined = $state()

	// Lets a route animation (an AI/online opponent's move, or a local move nearing
	// an edge) drive this board's camera. Methods read `localTeam`/the live fog at
	// call time, so the adapter object is stable across the board's lifetime.
	const routeCam: RouteCamera = {
		view: () => scrollerInstance?.viewport?.() ?? null,
		panTo: (left, top, animate) => scrollerInstance?.scrollToPx?.(left, top, animate) ?? null,
		sees: (tile, unit, m) => {
			if (unit.team === localTeam) return true
			const fog = get(viewerVisibility)
			if (!unitSeenByViewer(fog, tile, unit)) return false
			return !isUnitStealthed(m, tile, unit)
		},
		owns: (unit) => unit.team === localTeam,
	}

	onMount(() => {
		if (!colorizer) colorizer = imageColorizer()

		hudImages.advice.src = hud.advice
		hudImages.arrow.src = hud.arrow

		// Only the main gameplay board follows moves — never a minimap or the editor.
		if (!mini && !editor) setRouteCamera(routeCam)

		if (!campaign) return
		// `move: x,y` in a campaign script publishes here. Skip the initial
		// `null` and bring `(x, y)` into view (centred, clamped to map bounds).
		return campaignCamera.subscribe((pos) => {
			if (!pos) return
			scrollerInstance?.panToTile?.(pos.x, pos.y)
		})
	})

	onDestroy(() => {
		clearRouteCamera(routeCam)
		if (clockHeld) {
			stopAnimationClock()
			clockHeld = false
		}
		if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(fogRaf)
	})
</script>

<div
	class="w-full h-full flex justify-center items-center {backdrop}"
	style="padding-right: {gutter}px"
>
	{#if colorizer}
		<Game {map} {makeImage} {colorizer} {select} {campaign} {editor}>
			{#snippet children({ interfacer, renderData, select, validTile })}
				{#if $contextLoaded}
					<TileSelector
						{animator}
						{mini}
						{miniCell}
						{editor}
						{interfacer}
						{select}
						{validTile}
						{canSelectAt}
						{hover}
					>
						{#snippet children({
							cellWidth,
							cellHeight,
							handleClick,
							handleHover,
							handleKeypress,
							handleOffset,
						})}
							{@const SvelteComponent = scroller}
							<!--
								`min-w-0 min-h-0 overflow-hidden` is load-bearing. The canvas inside
								is sized in px by the Scroller's reflow, and as a flex item this box
								defaults to a min-content floor — so an oversized canvas propped the
								box open, the section's clientWidth stayed at the old value, and
								reflow's "nothing changed" early-out then refused to shrink it. The
								board could grow with the window but never shrink back (and likewise
								never give room back to the HUD rail). Clipping the overflow keeps
								the canvas from voting on its own container's size.
							-->
							<div
								class="w-full h-full min-w-0 min-h-0 overflow-hidden"
								style={mini
									? `max-width: ${map.cols * cellWidth}px; max-height: ${map.rows * cellHeight}px`
									: ''}
							>
								<SvelteComponent
									bind:this={scrollerInstance}
									tileWidth={cellWidth}
									tileHeight={cellHeight}
									contentWidth={cellWidth * map.cols}
									contentHeight={cellHeight * map.rows}
									paint={paint(
										renderData,
										hudImages,
										pause,
										visibilityProvider,
										localTeam,
										editor,
										fadeScope
									)(() => map)}
									afterPaint={flushDeferredOverlays}
									{requestRedraw}
									reflowSignal={gutter}
									dragPaint={editor}
									{handleClick}
									{handleHover}
									{handleKeypress}
									{handleOffset}
								/>
							</div>
						{/snippet}
					</TileSelector>
				{:else}
					<Loader />
				{/if}
			{/snippet}
		</Game>
	{/if}
</div>

<img class="hidden" bind:this={hudImages.arrow} src={hud.arrow} alt="placeholder arrow" />
<img class="hidden" bind:this={hudImages.advice} src={hud.advice} alt="placeholder advice" />
