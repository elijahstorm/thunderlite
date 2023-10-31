<script lang="ts">
	import { onMount } from 'svelte'
	import { MakeTiling, type Tiling } from './Tiling'
	import { MakeScroller, type Scroller } from './Scroller'
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
	} from './PageInteractions'

	export let tileWidth: number
	export let tileHeight: number
	export let contentWidth: number
	export let contentHeight: number
	export let requestRedraw = 0

	export let handleClick: (x: number, y: number) => void
	export let handleHover: (x: number, y: number) => void
	export let handleOffset: (x: number, y: number, zoom: number) => void
	export let handleKeypress: (key: string, shiftKey: boolean) => void

	let scroller: Scroller
	let container: HTMLElement
	let content: HTMLCanvasElement
	let context: CanvasRenderingContext2D
	let tiling: Tiling

	let reflow: VoidFunction
	const render = () => reflow && !scroller?.__isDecelerating && !scroller?.__isTracking && reflow()
	export let paint =
		(context: CanvasRenderingContext2D) =>
		(
			row: number,
			col: number,
			left: number,
			top: number,
			width: number,
			height: number,
			zoom: number
		) => {
			context.save()
			context.translate(left, top)

			context.fillStyle = (row % 2) + (col % 2) > 0 ? '#ddd' : '#fff'
			context.fillRect(0, 0, width, height)

			context.fillStyle = 'black'
			context.font = (14 * zoom).toFixed(2) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif'

			context.fillText(`${row}, ${col}`, 6 * zoom, 18 * zoom)

			context.restore()
		}

	onMount(() => {
		const _context = content.getContext('2d')
		if (!_context) {
			return
		}

		context = _context
		tiling = MakeTiling()
		scroller = MakeScroller(tiling.render(handleOffset, paint(context)), {
			bouncing: false,
			locking: false,
		})

		let rect = container.getBoundingClientRect()
		scroller.setPosition(rect.left + container.clientLeft, rect.top + container.clientTop)

		reflow = () => {
			const clientWidth = container.clientWidth
			const clientHeight = container.clientHeight
			content.width = clientWidth
			content.height = clientHeight
			tiling.setup({
				clientWidth,
				clientHeight,
				contentWidth,
				contentHeight,
				tileWidth,
				tileHeight,
			})
			scroller.options.locking = window.innerWidth <= 768
			scroller.setDimensions(clientWidth, clientHeight, contentWidth, contentHeight)
		}

		reflow()
	})

	$: {
		contentWidth
		contentHeight
		requestRedraw
		render()
	}
</script>

<svelte:window on:resize={reflow} />

<section
	role="grid"
	tabindex="0"
	bind:this={container}
	on:click|stopPropagation|preventDefault={click(
		container.getBoundingClientRect(),
		scroller
	)(handleClick)}
	on:keypress|stopPropagation|preventDefault={keypress(handleKeypress)}
	on:touchstart={touchstart(scroller)}
	on:touchmove|stopPropagation|preventDefault={touchmove(scroller)}
	on:touchend={touchend(scroller)}
	on:touchcancel={touchcancel(scroller)}
	on:mousedown|stopPropagation|preventDefault={mousedown(scroller)}
	on:mouseup|stopPropagation|preventDefault={mouseup(scroller)}
	on:contextmenu|stopPropagation|preventDefault={contextmenu(scroller)}
	on:mousemove|stopPropagation|preventDefault={mousemove(
		container.getBoundingClientRect(),
		scroller
	)(handleHover)}
	class="h-full outline-none"
>
	<canvas bind:this={content} />
</section>
