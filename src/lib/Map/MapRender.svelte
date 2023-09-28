<script lang="ts">
	import { PUBLIC_GAME_NAME } from '$env/static/public'
	import Scroller from '$lib/Scroller/Scroller.svelte'
	import TileSelector from '$lib/Layers/TileSelector.svelte'
	import Game from '$lib/Engine/Game.svelte'
	import { paint } from '$lib/Engine/Paint'

	export let map: MapObject
	export let makeImage: (url: string) => (signalLoaded: (image: HTMLImageElement) => void) => void
	export let loaded: boolean
</script>

<svelte:head>
	<title>{PUBLIC_GAME_NAME}</title>
</svelte:head>

<div class="p-6 h-screen">
	<div class="flex gap-2 border-4 border-black h-full">
		<Game
			{map}
			{makeImage}
			let:interfacer
			let:select
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
				<slot />
			{/if}
		</Game>
	</div>
</div>
