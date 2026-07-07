<script lang="ts">
	import { onMount } from 'svelte'
	import type { Scroller } from './Scroller'

	interface Props {
		scroller: Scroller
	}

	let { scroller = $bindable() }: Props = $props()

	let scrollingX: boolean = $state(true)
	let scrollingY: boolean = $state(true)
	let animating: boolean = $state(true)
	let bouncing: boolean = $state(false)
	let locking: boolean = $state(true)

	let zooming: boolean = $state(true)
	let zoomLevel: string = $state('1')
	let zoom = $state<VoidFunction>()
	let zoomIn = $state<VoidFunction>()
	let zoomOut = $state<VoidFunction>()

	let scrollLeft: string = $state('0')
	let scrollTop: string = $state('0')
	let scrollTo: VoidFunction | null = $state(null)
	let scrollByUp = $state<VoidFunction>()
	let scrollByDown = $state<VoidFunction>()
	let scrollByLeft = $state<VoidFunction>()
	let scrollByRight = $state<VoidFunction>()

	let saveChanges = $state(
		(
			key: 'scrollingX' | 'scrollingY' | 'animating' | 'bouncing' | 'locking' | 'zooming',
			value: boolean
		) => {}
	)

	$effect(() => {
		saveChanges('scrollingX', scrollingX)
	})
	$effect(() => {
		saveChanges('scrollingY', scrollingY)
	})
	$effect(() => {
		saveChanges('animating', animating)
	})
	$effect(() => {
		saveChanges('bouncing', bouncing)
	})
	$effect(() => {
		saveChanges('locking', locking)
	})
	$effect(() => {
		saveChanges('zooming', zooming)
	})
	$effect(() => {
		scrollTo && scrollTop !== null ? scrollTo() : null
	})
	$effect(() => {
		scrollTo && scrollLeft !== null ? scrollTo() : null
	})

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
		<button onclick={zoom} id="zoom">Zoom to Level</button><button onclick={zoomIn} id="zoomIn"
			>+</button
		><button onclick={zoomOut} id="zoomOut">-</button>
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
	<div><button onclick={scrollTo} id="scrollTo">Scroll to Coords</button></div>

	<div>
		<button onclick={scrollByUp} id="scrollByUp">&uarr;</button><button
			onclick={scrollByDown}
			id="scrollByDown">&darr;</button
		><button onclick={scrollByLeft} id="scrollByLeft">&larr;</button><button
			onclick={scrollByRight}
			id="scrollByRight">&rarr;</button
		>
	</div>
</section>
