<script lang="ts">
	import { onMount } from 'svelte'
	import type { Scroller } from './Scroller'

	export let scroller: Scroller

	let scrollingX: boolean = true
	let scrollingY: boolean = true
	let animating: boolean = true
	let bouncing: boolean = true
	let locking: boolean = true

	let zooming: boolean = true
	let zoomLevel: string = '1'
	let zoom: VoidFunction
	let zoomIn: VoidFunction
	let zoomOut: VoidFunction

	let scrollLeft: string = '0'
	let scrollTop: string = '0'
	let scrollTo: VoidFunction | null = null
	let scrollByUp: VoidFunction
	let scrollByDown: VoidFunction
	let scrollByLeft: VoidFunction
	let scrollByRight: VoidFunction

	let saveChanges = (
		key: 'scrollingX' | 'scrollingY' | 'animating' | 'bouncing' | 'locking' | 'zooming',
		value: boolean
	) => {}

	$: saveChanges('scrollingX', scrollingX)
	$: saveChanges('scrollingY', scrollingY)
	$: saveChanges('animating', animating)
	$: saveChanges('bouncing', bouncing)
	$: saveChanges('locking', locking)
	$: saveChanges('zooming', zooming)
	$: scrollTo && scrollTop !== null ? scrollTo() : null
	$: scrollTo && scrollLeft !== null ? scrollTo() : null

	onMount(() => {
		saveChanges = (key, value) => {
			scroller.options[key] = value
		}

		zoom = () => {
			scroller.zoomTo(parseFloat(zoomLevel))
		}

		zoomIn = () => {
			scroller.zoomBy(1.2, true)
		}

		zoomOut = () => {
			scroller.zoomBy(0.8, true)
		}

		scrollTo = () => {
			scroller.scrollTo(parseFloat(scrollLeft) * 100, parseFloat(scrollTop) * 100, true)
		}

		scrollByUp = () => {
			scroller.scrollBy(0, -150, true)
		}

		scrollByRight = () => {
			scroller.scrollBy(150, 0, true)
		}

		scrollByDown = () => {
			scroller.scrollBy(0, 150, true)
		}

		scrollByLeft = () => {
			scroller.scrollBy(-150, 0, true)
		}
	})
</script>

<section>
	<div>
		<label for="scrollingX">ScrollingX: </label><input
			type="checkbox"
			bind:checked={scrollingX}
			id="scrollingX"
		/>
	</div>
	<div>
		<label for="scrollingY">ScrollingY: </label><input
			type="checkbox"
			bind:checked={scrollingY}
			id="scrollingY"
		/>
	</div>
	<div>
		<label for="animating">Animating: </label><input
			type="checkbox"
			bind:checked={animating}
			id="animating"
		/>
	</div>
	<div>
		<label for="bouncing">Bouncing: </label><input
			type="checkbox"
			bind:checked={bouncing}
			id="bouncing"
		/>
	</div>
	<div>
		<label for="locking">Locking: </label><input
			type="checkbox"
			bind:checked={locking}
			id="locking"
		/>
	</div>

	<div>
		<label for="zooming">Zooming: </label><input
			type="checkbox"
			bind:checked={zooming}
			id="zooming"
		/>
	</div>

	<div>
		<label for="zoomLevel">Zoom Level: </label><input
			type="text"
			bind:value={zoomLevel}
			id="zoomLevel"
			size="5"
		/>
	</div>
	<div>
		<button on:click={zoom} id="zoom">Zoom to Level</button><button on:click={zoomIn} id="zoomIn"
			>+</button
		><button on:click={zoomOut} id="zoomOut">-</button>
	</div>

	<div>
		<label for="scrollLeft">Scroll Left: </label><input
			type="text"
			bind:value={scrollLeft}
			id="scrollLeft"
			size="9"
		/>
	</div>
	<div>
		<label for="scrollTop">Scroll Top: </label><input
			type="text"
			bind:value={scrollTop}
			id="scrollTop"
			size="9"
		/>
	</div>
	<div><button on:click={scrollTo} id="scrollTo">Scroll to Coords</button></div>

	<div>
		<button on:click={scrollByUp} id="scrollByUp">&uarr;</button><button
			on:click={scrollByDown}
			id="scrollByDown">&darr;</button
		><button on:click={scrollByLeft} id="scrollByLeft">&larr;</button><button
			on:click={scrollByRight}
			id="scrollByRight">&rarr;</button
		>
	</div>
</section>
