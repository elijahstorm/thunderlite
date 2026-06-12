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
	import { onDestroy, onMount } from 'svelte'
	import { animationFrame, animationTimer } from '$lib/Sprites/animationFrameCount'
	import { connectionDecision } from '$lib/Sprites/spriteConnector'
	import { imageColorizer } from '$lib/Sprites/imageColorizer'
	import { createImageLoader } from '$lib/Sprites/images'
	import { writable } from 'svelte/store'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { updateRoute } from '$lib/Layers/tileHighlighter'
	import { interactionSource } from '$lib/Engine/Interactor/interactionState'
	import { fogOfWarEnabled, viewerVisibility } from '$lib/Engine/fogState'
	import { setHoverTile } from '$lib/Engine/uiState'
	import { ANIMATION_TIME, routeAnimation, animations } from '$lib/Engine/Animator/animator'
	import type { CutsceneScript } from '$lib/Campaign/cutsceneTypes'
	import { campaignCamera } from '$lib/Campaign/campaignInterface'

	export let map: MapObject
	/** When set, this board is a scripted campaign level; forwarded to `Game`,
	 * which drives the K1 script (dialogue, camera, spawns) against the engine. */
	export let campaign: CutsceneScript | undefined = undefined
	export let mini: boolean = false
	export let pause = false
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

	let cachedVisibility: {
		team: number
		turnNumber: number
		tile: number
		visible: Set<number>
	} | null = null

	const visibilityProvider: VisibilityProvider = fogOfWar
		? () => {
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
		: () => null

	$: if (fogOfWar) {
		// invalidate cache when units move or turn changes
		$gameState
		cachedVisibility = null
	}

	// Engine code (attack list, AI, threat reach) consults `fogOfWarEnabled` to
	// decide whether to apply the team-visibility filter. Sync it whenever this
	// board's fog prop changes so a freshly-mounted campaign board doesn't carry
	// over a stale "on" value from a prior online match.
	$: fogOfWarEnabled.set(fogOfWar)

	// Mirror the viewer's visibility snapshot into a global store so the DOM
	// Animator (walking/attack/explosion overlays) can hide animations whose
	// source tile is in fog. Depends on $gameState so we refresh as units act
	// and the cached set is invalidated above.
	$: {
		$gameState
		viewerVisibility.set(fogOfWar ? visibilityProvider() : null)
	}

	// @ts-ignore
	let hudImages: HUDImages = {}

	const hover = (x: number, y: number) => {
		const tile = y * map.cols + x
		if (!mini) setHoverTile(tile)
		const result = updateRoute(map, $interactionSource, map.pathHistory ?? [], tile)
		map.pathHistory = result.pathHistory
		map.route = result.route
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

	const inc = () => {
		if (pause) {
			$animationTimer = null
			return
		}
		animationFrame.update((frame) => (frame + 1) % 100000)
		$animationTimer = setTimeout(inc, ANIMATION_TIME)
		render()
	}

	$: {
		$animations
		$routeAnimation
		map.layers.ground.map(
			(object, index) => (object.state = connectionDecision(object)(map, index))
		)
		render()
	}

	$: {
		if (!pause && !$animationTimer) {
			$animationTimer = setTimeout(inc, ANIMATION_TIME)
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

		if (!pause && !$animationTimer) {
			$animationTimer = setTimeout(inc, ANIMATION_TIME)
		}

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
		if ($animationTimer) {
			clearTimeout($animationTimer)
		}
		$animationTimer = null
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
							paint={paint(renderData, hudImages, pause, visibilityProvider, localTeam)(() => map)}
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
