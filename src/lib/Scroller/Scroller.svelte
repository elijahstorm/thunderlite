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

	/**
	 * Scroll the view so the tile at `(x, y)` lands in the viewport centre.
	 * Used by the campaign script's `move:` command to pan the camera onto the
	 * action; the underlying `scrollTo` clamps to map bounds, so requests near
	 * an edge stop with the tile as close to centre as the board allows.
	 */
	export const panToTile = (x: number, y: number, animate = true): void => {
		if (!scroller || !container) return
		const cw = container.clientWidth
		const ch = container.clientHeight
		const left = (x + 0.5) * tileWidth - cw / 2
		const top = (y + 0.5) * tileHeight - ch / 2
		scroller.scrollTo(left, top, animate)
	}
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

	// Half of the leftover space on each axis when the content is smaller than the
	// viewport. Larger-than-viewport content yields 0, so panning is unaffected.
	const centerOffset = (zoom: number): [number, number] => {
		if (!tiling) return [0, 0]
		return [
			Math.max((tiling.__clientWidth - tiling.__contentWidth * zoom) / 2, 0),
			Math.max((tiling.__clientHeight - tiling.__contentHeight * zoom) / 2, 0),
		]
	}

	// Screen→content hit-testing must account for the centring offset below, so
	// shift the reference rect by the same amount the board was shifted.
	const boardRect = (): DOMRect => {
		if (!container) return new DOMRect()
		const rect = container.getBoundingClientRect()
		const [cx, cy] = centerOffset(scroller?.__zoomLevel ?? 1)
		return { ...rect.toJSON(), left: rect.left + cx, top: rect.top + cy } as DOMRect
	}

	onMount(() => {
		const _context = content.getContext('2d')
		if (!_context) {
			return
		}

		context = _context
		tiling = MakeTiling()

		// Centre the board: render with half the leftover space as an offset, and
		// signal that same offset to the overlay layers (hover/animator), so a map
		// smaller than the viewport sits in the middle instead of the top-left
		// corner. Maps larger than the viewport pan exactly as before.
		const drawTiles = tiling.render(handleOffset, paint(context))
		const renderCentered = (left: number, top: number, zoom: number) => {
			const [cx, cy] = centerOffset(zoom)
			drawTiles(left - cx, top - cy, zoom)
		}
		scroller = MakeScroller(renderCentered, {
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
			// Re-anchor the scroller's screen position too — a window resize can shift
			// the board's left/top, and the touch math relies on these to map finger
			// coordinates back into the content.
			const r = container.getBoundingClientRect()
			scroller.setPosition(r.left + container.clientLeft, r.top + container.clientTop)
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
	on:click|stopPropagation|preventDefault={click(boardRect, scroller)(handleClick)}
	on:keypress|stopPropagation|preventDefault={keypress(handleKeypress)}
	on:touchstart={touchstart(scroller)}
	on:touchmove|stopPropagation|preventDefault={touchmove(scroller)}
	on:touchend={touchend(scroller)}
	on:touchcancel={touchcancel(scroller)}
	on:mousedown|stopPropagation|preventDefault={mousedown(scroller)}
	on:mouseup|stopPropagation|preventDefault={mouseup(scroller)}
	on:contextmenu|stopPropagation|preventDefault={contextmenu(scroller)}
	on:mousemove|stopPropagation|preventDefault={mousemove(boardRect, scroller)(handleHover)}
	class="h-full outline-none"
>
	<canvas bind:this={content}></canvas>
</section>
