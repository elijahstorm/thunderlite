<script lang="ts">
	import Scroller from '$lib/Scroller/Scroller.svelte'
	import Animator from '$lib/Engine/Animator/Animator.svelte'
	import TileSelector from '$lib/Layers/TileSelector.svelte'
	import Game from '$lib/Engine/Game.svelte'
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'
	import { paint } from '$lib/Engine/paint'
	import { onDestroy, onMount } from 'svelte'
	import { animationFrame, animationTimer } from '$lib/Sprites/animationFrameCount'
	import { connectionDecision } from '$lib/Sprites/spriteConnector'
	import { imageColorizer } from '$lib/Sprites/imageColorizer'
	import { createImageLoader } from '$lib/Sprites/images'
	import { writable } from 'svelte/store'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { updateRoute } from '$lib/Layers/tileHighlighter'
	import { interactionSource } from '$lib/Engine/Interactor/interactionState'
	import { ANIMATION_TIME, routeAnimation, animations } from '$lib/Engine/Animator/animator'

	export let map: MapObject
	export let mini: boolean = false
	export let pause = false
	export let requestRedraw = 0
	export let hud = {
		advice: '/game/play/icon/move/advice.png',
		arrow: '/game/play/icon/route/arrow.png',
	}

	export let contextLoaded = writable(!!$rendererStore.ground[0]?.sprite)
	export let makeImage: ReturnType<typeof createImageLoader> = createImageLoader(
		(finished: boolean) => ($contextLoaded = finished)
	)
	export let colorizer: typeof imageColorizer = imageColorizer
	export let scroller: typeof Scroller = Scroller
	export let animator: typeof Animator = Animator
	export let select: undefined | ((x: number, y: number) => void) = undefined

	const render = () => (requestRedraw = performance.now())

	// @ts-ignore
	let hudImages: HUDImages = {}

	const hover = (x: number, y: number) =>
		(map.route = updateRoute(map, $interactionSource, [...map.route], y * map.cols + x))

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

	onMount(() => {
		if (!pause && !$animationTimer) {
			$animationTimer = setTimeout(inc, ANIMATION_TIME)
		}

		hudImages.advice.src = hud.advice
		hudImages.arrow.src = hud.arrow
	})

	onDestroy(() => {
		if ($animationTimer) {
			clearTimeout($animationTimer)
		}
		$animationTimer = null
	})
</script>

<Game {map} {makeImage} {colorizer} {select} let:interfacer let:renderData let:select let:validTile>
	{#if $contextLoaded}
		<TileSelector
			{animator}
			{mini}
			{interfacer}
			{select}
			{validTile}
			{hover}
			let:cellWidth
			let:cellHeight
			let:handleClick
			let:handleHover
			let:handleKeypress
			let:handleOffset
		>
			<div class="w-[{map.cols * cellWidth}px] h-[{map.rows * cellHeight}px]">
				<svelte:component
					this={scroller}
					tileWidth={cellWidth}
					tileHeight={cellHeight}
					contentWidth={cellWidth * map.cols}
					contentHeight={cellHeight * map.rows}
					paint={paint(renderData, hudImages, pause)(() => map)}
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

<img class="hidden" bind:this={hudImages.arrow} src={hud.arrow} alt="placeholder arrow" />
<img class="hidden" bind:this={hudImages.advice} src={hud.advice} alt="placeholder advice" />
