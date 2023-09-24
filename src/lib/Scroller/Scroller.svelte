<script lang="ts">
	import { onMount } from 'svelte'
	import { MakeTiling, type Tiling } from './Tiling'
	import { MakeScroller, type Scroller } from './Scroller'
	import RenderSettings from './RenderSettings.svelte'

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
	let tiling: Tiling

	let scroller: Scroller

	onMount(() => {
		if (!container) {
			return
		}

		const _context = content.getContext('2d')
		if (_context) {
			context = _context
		}
		tiling = MakeTiling()

		// Initialize Scroller
		scroller = MakeScroller(render, {
			zooming: true,
		})

		let rect = container.getBoundingClientRect()
		scroller.setPosition(rect.left + container.clientLeft, rect.top + container.clientTop)

		// Reflow handling
		let reflow = function () {
			clientWidth = container.clientWidth
			clientHeight = container.clientHeight
			scroller.setDimensions(
				clientWidth,
				clientHeight,
				settings.contentWidth,
				settings.contentHeight
			)
		}

		window.addEventListener('resize', reflow, false)
		reflow()
	})

	// Canvas renderer
	const render = (left: number, top: number, zoom: number) => {
		// Sync current dimensions with canvas
		content.width = clientWidth
		content.height = clientHeight

		// Full clearing
		context.clearRect(0, 0, clientWidth, clientHeight)

		// Use tiling
		tiling.setup({
			clientWidth,
			clientHeight,
			contentWidth: settings.contentWidth,
			contentHeight: settings.contentHeight,
			tileWidth: settings.cellWidth,
			tileHeight: settings.cellHeight,
		})
		tiling.render(left, top, zoom, paint)
	}

	// Cell Paint Logic
	const paint = (
		row: number,
		col: number,
		left: number,
		top: number,
		width: number,
		height: number,
		zoom: number
	) => {
		console.log('test hehe')
		context.fillStyle = (row % 2) + (col % 2) > 0 ? '#ddd' : '#fff'
		context.fillRect(left, top, width, height)

		context.fillStyle = 'black'
		context.font = (14 * zoom).toFixed(2) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif'

		// Pretty primitive text positioning :)
		context.fillText(row + ',' + col, left + 6 * zoom, top + 18 * zoom)
	}
</script>

<section bind:this={container} class="w-1/2 h-96 border border-solid">
	<canvas bind:this={content}> </canvas>
</section>

<RenderSettings {scroller} />
