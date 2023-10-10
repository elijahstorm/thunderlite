<script lang="ts">
	import { PUBLIC_GAME_NAME } from '$env/static/public'
	import Scroller from '$lib/Scroller/Scroller.svelte'
	import TileSelector from '$lib/Layers/TileSelector.svelte'
	import Game from '$lib/Engine/Game.svelte'
	import { paint } from '$lib/Engine/paint'
	import { onDestroy, onMount } from 'svelte'
	import { animationFrame, animationTimer } from '$lib/Sprites/animationFrameCount'
	import { connectionDecision } from '$lib/Sprites/spriteConnector'

	export let pause = false
	export let map: MapObject
	export let makeImage: (url: string) => (signalLoaded: (image: HTMLImageElement) => void) => void
	export let loaded: boolean
	export let select: undefined | ((x: number, y: number) => void)
	export let mini: boolean = false

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

<svelte:head>
	<title>{PUBLIC_GAME_NAME}</title>
</svelte:head>

<div class="flex gap-2 border-4 border-black h-full bg-stone-400">
	<Game {map} {makeImage} {select} let:interfacer let:renderData let:select let:validTile>
		{#if loaded}
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
				<Scroller
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
			<p>loading...</p>
		{/if}
	</Game>
</div>
