<script lang="ts">
	import { onMount } from 'svelte'
	import { MakeTiling, type Tiling } from './Tiling'
	import { MakeScroller, type Scroller } from './Scroller'
	import { animationFrame } from '$lib/Sprites/animationFrameCount'
	import {
		touchstart,
		touchmove,
		touchend,
		touchcancel,
		mousedown,
		mouseup,
		contextmenu,
		mousemove,
		click,
		keypress,
		keydown,
		wheel,
	} from './PageInteractions'

	// $state.raw, NOT $state: MakeScroller returns a plain object whose internal
	// tap/drag/deceleration state machine mutates in place; a deep proxy corrupts it
	// (input dies after the first interaction) and fires reactivity on every pan tick.
	let scroller = $state.raw<Scroller>()
	let container = $state<HTMLElement>()
	let tiling: Tiling

	let reflow = $state<VoidFunction>()
	const render = () => reflow && !scroller?.__isDecelerating && !scroller?.__isTracking && reflow()

	// Mirror Scroller's imperative API so this stand-in is swap-compatible in
	// tests. Headless tests don't measure layout, so no-ops satisfy the types
	// without changing behaviour (the route camera simply gets a null viewport).
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export const panToTile = (_x: number, _y: number, _animate = true): void => {}
	export const viewport = (): {
		left: number
		top: number
		width: number
		height: number
		tileWidth: number
		tileHeight: number
	} | null => null
	/* eslint-disable @typescript-eslint/no-unused-vars */
	export const scrollToPx = (
		_left: number,
		_top: number,
		_animate = true
	): { left: number; top: number } | null => null

	interface Props {
		tileWidth: number
		tileHeight: number
		contentWidth: number
		contentHeight: number
		requestRedraw?: number
		handleClick: (x: number, y: number) => void
		handleHover: (x: number, y: number) => void
		handleOffset: (x: number, y: number, zoom: number) => void
		handleKeypress: (key: string, shiftKey: boolean) => void
		/* eslint-enable @typescript-eslint/no-unused-vars */
		paint?: any
	}

	let {
		tileWidth,
		tileHeight,
		contentWidth,
		contentHeight,
		requestRedraw = 0,
		handleClick,
		handleHover,
		handleOffset,
		handleKeypress,
		paint = (context: CanvasRenderingContext2D) =>
			(
				row: number,
				col: number,
				left: number,
				top: number,
				width: number,
				height: number,
				zoom: number
			) => {},
	}: Props = $props()

	onMount(() => {
		if (!container) return
		// `container` is `$state<HTMLElement>()` (typed `HTMLElement | undefined`);
		// capture a non-null local after the guard so the `reflow` closure below
		// keeps it narrowed. It's bound once on mount and never cleared.
		const el = container
		paint
		tiling = MakeTiling()
		const activeScroller = MakeScroller(
			tiling.render(handleOffset, () => {}),
			{
				bouncing: false,
				locking: false,
			}
		)
		scroller = activeScroller

		let rect = el.getBoundingClientRect()
		activeScroller.setPosition(rect.left + el.clientLeft, rect.top + el.clientTop)

		reflow = () => {
			const clientWidth = el.clientWidth
			const clientHeight = el.clientHeight
			tiling.setup({
				clientWidth,
				clientHeight,
				contentWidth,
				contentHeight,
				tileWidth,
				tileHeight,
			})
			activeScroller.options.locking = window.innerWidth <= 768
			activeScroller.setDimensions(clientWidth, clientHeight, contentWidth, contentHeight)
		}

		reflow()
		el.focus()
	})

	$effect(() => {
		$animationFrame
		contentWidth
		contentHeight
		requestRedraw
		render()
	})
</script>

<svelte:window onresize={() => reflow?.()} />

<section
	role="grid"
	tabindex="0"
	bind:this={container}
	onclick={(e) => {
		if (!scroller || !container) return
		e.stopPropagation()
		e.preventDefault()
		click(() => container!.getBoundingClientRect(), scroller)(handleClick)(e)
	}}
	onkeypress={keypress(handleKeypress)}
	onkeydown={(e) => {
		if (!scroller) return
		keydown(scroller, tileWidth, tileHeight)(e)
	}}
	onwheel={(e) => {
		if (!scroller) return
		e.preventDefault()
		wheel(scroller)(e)
	}}
	ontouchstart={(e) => {
		if (!scroller) return
		e.stopPropagation()
		e.preventDefault()
		touchstart(scroller)(e)
	}}
	ontouchmove={(e) => {
		if (!scroller) return
		e.stopPropagation()
		e.preventDefault()
		touchmove(scroller)(e)
	}}
	ontouchend={(e) => {
		if (!scroller) return
		e.stopPropagation()
		e.preventDefault()
		touchend(scroller)(e)
	}}
	ontouchcancel={(e) => {
		if (!scroller) return
		e.stopPropagation()
		e.preventDefault()
		touchcancel(scroller)(e)
	}}
	onmousedown={(e) => {
		if (!scroller) return
		e.stopPropagation()
		e.preventDefault()
		mousedown(scroller)(e)
	}}
	onmouseup={(e) => {
		if (!scroller) return
		e.stopPropagation()
		e.preventDefault()
		mouseup(scroller)(e)
	}}
	oncontextmenu={(e) => {
		if (!scroller) return
		e.stopPropagation()
		e.preventDefault()
		contextmenu(scroller)(e)
	}}
	onmousemove={(e) => {
		if (!scroller || !container) return
		e.stopPropagation()
		e.preventDefault()
		mousemove(() => container!.getBoundingClientRect(), scroller)(handleHover)(e)
	}}
	class="h-full outline-none"
></section>
