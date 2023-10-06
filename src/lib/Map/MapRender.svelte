<script lang="ts">
	import { PUBLIC_GAME_NAME } from '$env/static/public'
	import Scroller from '$lib/Scroller/Scroller.svelte'
	import TileSelector from '$lib/Layers/TileSelector.svelte'
	import Game from '$lib/Engine/Game.svelte'
	import { paint } from '$lib/Engine/Paint'
	import { onDestroy, onMount } from 'svelte'
	import { animationFrame } from '$lib/Sprites/animationFrameCount'

	export let pause = false
	export let map: MapObject
	export let makeImage: (url: string) => (signalLoaded: (image: HTMLImageElement) => void) => void
	export let loaded: boolean
	export let select: undefined | ((x: number, y: number) => void)

	let timer: NodeJS.Timeout
	const inc = () => {
		if (pause) {
			return
		}
		animationFrame.update((frame) => (frame + 1) % 100000)
		timer = setTimeout(inc, 800)
	}

	$: {
		if (pause) {
			timer = setTimeout(inc, 800)
		}
	}

	onMount(() => {
		timer = setTimeout(inc, 1000)
	})

	onDestroy(() => clearTimeout(timer))
</script>

<svelte:head>
	<title>{PUBLIC_GAME_NAME}</title>
</svelte:head>

<div class="flex gap-2 border-4 border-black h-full bg-stone-400">
	<Game
		{map}
		{makeImage}
		{select}
		let:select
		let:interfacer
		let:validTile
		let:rows
		let:cols
		let:renderData
	>
		{#if loaded}
			<TileSelector
				{interfacer}
				{select}
				{validTile}
				let:handleClick
				let:handleHover
				let:handleKeypress
				let:handleOffset
				let:cellWidth
				let:cellHeight
			>
				<Scroller
					{cellHeight}
					{cellWidth}
					{rows}
					{cols}
					paint={paint(renderData)(map)}
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
