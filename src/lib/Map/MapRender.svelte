<script lang="ts">
	import { PUBLIC_GAME_NAME } from '$env/static/public'
	import Scroller from '$lib/Scroller/Scroller.svelte'
	import type { Scroller as ScrollerType } from '$lib/Scroller/Scroller'
	import TileSelector from '$lib/Layers/TileSelector.svelte'
	import Game from '$lib/Engine/Game.svelte'
	import { paint } from '$lib/Engine/Paint'

	let scroller: ScrollerType
	export let map: MapObject
</script>

<svelte:head>
	<title>{PUBLIC_GAME_NAME}</title>
</svelte:head>

<div class="p-6 h-screen">
	<div class="flex gap-2 border-4 border-black h-full">
		<Game {map} let:interfacer let:select let:validTile let:rows let:cols>
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
					bind:scroller
					{interfacer}
					{cellHeight}
					{cellWidth}
					{rows}
					{cols}
					{paint}
					{handleClick}
					{handleHover}
					{handleKeypress}
					{handleOffset}
				/>
			</TileSelector>
		</Game>
	</div>
</div>
