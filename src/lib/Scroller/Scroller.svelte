<script lang="ts">
	import { onMount } from 'svelte'
	import { MakeTiling, type Tiling } from './Tiling'
	import { MakeScroller, type Scroller } from './Scroller'
	import {
		___touchstart,
		___touchmove,
		___touchend,
		___touchcancel,
		___mousedown,
		___mouseup,
		___contextmenu,
		___mousemove,
	} from './PageInteractions'

	let clientWidth = 0
	let clientHeight = 0

	const settings = {
		contentWidth: 2000,
		contentHeight: 2000,
		cellWidth: 100,
		cellHeight: 100,
	}

	let container: HTMLElement
	let content: HTMLCanvasElement
	let context: CanvasRenderingContext2D
	let reflow: VoidFunction
	let tiling: Tiling

	export let scroller: Scroller

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
		scroller = MakeScroller(tiling.render(paint(context)), { bouncing: false })

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
				contentWidth: settings.contentWidth,
				contentHeight: settings.contentHeight,
				tileWidth: settings.cellWidth,
				tileHeight: settings.cellHeight,
			})
			scroller.setDimensions(
				clientWidth,
				clientHeight,
				settings.contentWidth,
				settings.contentHeight
			)
		}

		reflow()
	})
</script>

<svelte:window on:resize={reflow} />

<section
	role="grid"
	tabindex="0"
	bind:this={container}
	on:touchstart|stopPropagation|preventDefault={___touchstart(scroller)}
	on:touchmove|stopPropagation|preventDefault={___touchmove(scroller)}
	on:touchend|stopPropagation|preventDefault={___touchend(scroller)}
	on:touchcancel|stopPropagation|preventDefault={___touchcancel(scroller)}
	on:mousedown|stopPropagation|preventDefault={___mousedown(scroller)}
	on:mouseup|stopPropagation|preventDefault={___mouseup(scroller)}
	on:contextmenu|stopPropagation|preventDefault={___contextmenu(scroller)}
	on:mousemove|stopPropagation|preventDefault={___mousemove(scroller)}
	class="h-full"
>
	<canvas bind:this={content} />
</section>
