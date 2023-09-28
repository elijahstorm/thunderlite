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

	export let cellWidth = 60
	export let cellHeight = 60
	export let rows = 10
	export let cols = 10

	export let scroller: Scroller

	export let handleClick = (x: number, y: number) => {}
	export let handleHover = (x: number, y: number) => {}
	export let handleOffset = (x: number, y: number, zoom: number) => {}
	export let handleKeypress = (key: string, shiftKey: boolean) => {}

	let container: HTMLElement
	let content: HTMLCanvasElement
	let context: CanvasRenderingContext2D
	let reflow: VoidFunction
	let tiling: Tiling

	let clientWidth = 0
	let clientHeight = 0
	let contentWidth: number = cellWidth * rows
	let contentHeight: number = cellHeight * cols

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
			clientWidth = container.clientWidth
			clientHeight = container.clientHeight
			content.width = clientWidth
			content.height = clientHeight
			tiling.setup({
				clientWidth,
				clientHeight,
				contentWidth: contentWidth,
				contentHeight: contentHeight,
				tileWidth: cellWidth,
				tileHeight: cellHeight,
			})
			scroller.setDimensions(clientWidth, clientHeight, contentWidth, contentHeight)
			scroller.options.locking = window.innerWidth <= 768
		}

		reflow()

		container.focus()
	})
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
	on:keypress={keypress(handleKeypress)}
	on:touchstart|stopPropagation|preventDefault={touchstart(scroller)}
	on:touchmove|stopPropagation|preventDefault={touchmove(scroller)}
	on:touchend|stopPropagation|preventDefault={touchend(scroller)}
	on:touchcancel|stopPropagation|preventDefault={touchcancel(scroller)}
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
