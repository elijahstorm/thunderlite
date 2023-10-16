<script lang="ts">
	import Scroller from '$lib/Scroller/Scroller.svelte'
	import TileSelector from '$lib/Layers/TileSelector.svelte'
	import Game from '$lib/Engine/Game.svelte'
	import { paint } from '$lib/Engine/paint'
	import { onDestroy, onMount } from 'svelte'
	import { animationFrame, animationTimer } from '$lib/Sprites/animationFrameCount'
	import { connectionDecision } from '$lib/Sprites/spriteConnector'
	import { imageColorizer } from '$lib/Sprites/imageColorizer'
	import { createImageLoader } from '$lib/Sprites/images'
	import Loader from '$lib/Components/Widgets/Helpers/Loader.svelte'

	export let map: MapObject
	export let mini: boolean = false
	export let pause = false

	export let contextLoaded: boolean = false
	export let makeImage: ReturnType<typeof createImageLoader> = createImageLoader(
		(finished: boolean) => (contextLoaded = finished)
	)
	export let colorizer: typeof imageColorizer = imageColorizer
	export let select: undefined | ((x: number, y: number) => void) = undefined
	export let scroller: typeof Scroller = Scroller

	const ANIMATION_TIME = 800
	let requestRedraw = 0

	$: {
		map.layers.ground.map(
			(object, index) => (object.state = connectionDecision(object)(map, index))
		)
		requestRedraw = performance.now()
	}

	const inc = () => {
		if (pause) {
			$animationTimer = null
			return
		}
		animationFrame.update((frame) => (frame + 1) % 100000)
		$animationTimer = setTimeout(inc, ANIMATION_TIME)
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
	})

	onDestroy(() => {
		if ($animationTimer) {
			clearTimeout($animationTimer)
		}
		$animationTimer = null
	})
</script>

<div class="flex gap-2 border-4 border-black h-full bg-stone-400">
	<Game
		{map}
		{makeImage}
		{colorizer}
		{select}
		let:interfacer
		let:renderData
		let:select
		let:validTile
	>
		{#if contextLoaded}
			<TileSelector
				{mini}
				{interfacer}
				{select}
				{validTile}
				let:cellWidth
				let:cellHeight
				let:handleClick
				let:handleHover
				let:handleKeypress
				let:handleOffset
			>
				<svelte:component
					this={scroller}
					tileWidth={cellWidth}
					tileHeight={cellHeight}
					contentWidth={cellWidth * map.cols}
					contentHeight={cellHeight * map.rows}
					paint={paint(renderData)(() => map)}
					{requestRedraw}
					{handleClick}
					{handleHover}
					{handleKeypress}
					{handleOffset}
				/>
			</TileSelector>
		{:else}
			<Loader />
		{/if}
	</Game>
</div>
