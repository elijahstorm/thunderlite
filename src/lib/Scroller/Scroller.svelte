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
		keydown,
		wheel,
	} from './PageInteractions'

	// $state.raw, NOT $state: MakeScroller returns a plain object whose internal
	// tap/drag/deceleration state machine (__isTracking, __scrollLeft, RAF loop, …)
	// mutates itself in place. A deep $state proxy corrupts that machine (input dies
	// after the first interaction) and fires reactivity on every pan tick. Raw state
	// still reacts to the one-time assignment in onMount for the `if (!scroller)` guards.
	let scroller = $state.raw<Scroller>()
	let container = $state<HTMLElement>()
	let content = $state<HTMLCanvasElement>()
	let context: CanvasRenderingContext2D
	let tiling: Tiling

	let redraw: VoidFunction
	let reflow = $state<VoidFunction>()
	// A redraw request (animation tick, fog fade, overlay change) only needs to
	// repaint the current view, so it maps to the lightweight `redraw`, never the
	// heavyweight `reflow`. Reassigning `content.width` clears the canvas and
	// resets context state, and `reflow` also rebuilds tiling and re-anchors the
	// scroller — doing that every animation frame dropped frames and flashed the
	// board white mid-animation. Skipped while the scroller drives its own paint
	// (touch tracking / deceleration) so we don't paint the same frame twice.
	const render = () => redraw && !scroller?.__isDecelerating && !scroller?.__isTracking && redraw()
	// Content dimensions last applied to the canvas/scroller, so `reflow` can
	// no-op when a resize event fires with nothing actually changed.
	let appliedContentWidth = -1
	let appliedContentHeight = -1

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

	/**
	 * Current committed scroll target (content px) plus the viewport and tile
	 * sizes. Reports the *scheduled* position so a follow that fires mid-animation
	 * measures from where the view is heading, not a half-completed slide. Null
	 * until the scroller has mounted. Used by the route-camera follow.
	 */
	export const viewport = (): {
		left: number
		top: number
		width: number
		height: number
		tileWidth: number
		tileHeight: number
	} | null => {
		if (!scroller || !container) return null
		return {
			left: scroller.__scheduledLeft,
			top: scroller.__scheduledTop,
			width: container.clientWidth,
			height: container.clientHeight,
			tileWidth,
			tileHeight,
		}
	}

	/**
	 * Scroll to a content-px position and return the clamped target that was
	 * actually applied (scrollTo clamps to the map bounds). Used by the route
	 * camera to trail a moving unit.
	 */
	export const scrollToPx = (
		left: number,
		top: number,
		animate = true
	): { left: number; top: number } | null => {
		if (!scroller) return null
		scroller.scrollTo(left, top, animate)
		return { left: scroller.__scheduledLeft, top: scroller.__scheduledTop }
	}

	// Optional pass run once per repaint, after every tile is painted. Lets a
	// painter draw overlays that must sit on top of the finished grid (e.g. a
	// unit outline that bleeds into neighbouring tiles which would otherwise

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
		paint?: any
		// paint over it).
		afterPaint?: ((context: CanvasRenderingContext2D) => void) | undefined
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
			) => {
				context.save()
				context.translate(left, top)

				context.fillStyle = (row % 2) + (col % 2) > 0 ? '#ddd' : '#fff'
				context.fillRect(0, 0, width, height)

				context.fillStyle = 'black'
				context.font = (14 * zoom).toFixed(2) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif'

				context.fillText(`${row}, ${col}`, 6 * zoom, 18 * zoom)

				context.restore()
			},
		afterPaint = undefined,
	}: Props = $props()

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
		if (!content || !container) return
		// Capture non-null locals after the guard: `content`/`container` are
		// `$state<T>()` (so typed `T | undefined`), and the guard above only
		// narrows the direct onMount scope — the nested `renderCentered`/`redraw`/
		// `reflow` closures below re-widen it. Both are assigned once on mount and
		// never cleared, so these captures stay valid for the component's lifetime.
		const canvas = content
		const el = container
		const _context = canvas.getContext('2d')
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
			// Clear before every scroll-driven repaint. Opaque tiles cover the play
			// area on their own, but the map-edge frame draws *outward* into the
			// off-map margin, which no tile repaints — without this clear those
			// pixels smear into a trail while dragging/decelerating. (The redraw
			// path via `reflow` already clears implicitly by reassigning canvas size.)
			context.clearRect(0, 0, canvas.width, canvas.height)
			const [cx, cy] = centerOffset(zoom)
			drawTiles(left - cx, top - cy, zoom)
			afterPaint?.(context)
		}
		scroller = MakeScroller(renderCentered, {
			bouncing: false,
			locking: false,
		})

		let rect = el.getBoundingClientRect()
		scroller.setPosition(rect.left + el.clientLeft, rect.top + el.clientTop)

		// Lightweight repaint of the current scroll position. This is what a redraw
		// request should do — clear and redraw the tiles where the board already
		// sits, with no canvas realloc, tiling rebuild, or layout read.
		redraw = () => {
			if (!scroller || !context) return
			const { left, top, zoom } = scroller.getValues()
			renderCentered(left, top, zoom)
		}

		reflow = () => {
			if (!scroller || !context) return
			const clientWidth = el.clientWidth
			const clientHeight = el.clientHeight
			// Assigning canvas.width/height clears the bitmap and resets context
			// state even when the value is unchanged, and the tiling rebuild +
			// getBoundingClientRect below are expensive. A resize event (or a
			// spurious reactive fire) with no real size change must not pay that
			// cost — just repaint, or the board flickers white during animations.
			if (
				clientWidth === canvas.width &&
				clientHeight === canvas.height &&
				contentWidth === appliedContentWidth &&
				contentHeight === appliedContentHeight
			) {
				redraw()
				return
			}
			appliedContentWidth = contentWidth
			appliedContentHeight = contentHeight
			canvas.width = clientWidth
			canvas.height = clientHeight
			// Resizing the canvas resets all context state, so re-disable smoothing
			// here (not just on mount). Pixel-art sprites: this stops drawImage from
			// anti-aliasing tile edges and blending the cleared background in at seams.
			context.imageSmoothingEnabled = false
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
			const r = el.getBoundingClientRect()
			scroller.setPosition(r.left + el.clientLeft, r.top + el.clientTop)
			scroller.setDimensions(clientWidth, clientHeight, contentWidth, contentHeight)
			// setDimensions clamps the scroll position and repaints synchronously
			// (its scrollTo snaps rather than animates), but the canvas was just
			// cleared by the resize above — repaint now so we never leave a blank
			// frame up while an animation waits for the next tick.
			redraw()
		}

		reflow()
	})

	// A redraw request (per-frame animation tick, fog fade, overlay change) just
	// repaints the current view. Kept separate from the reflow path below so the
	// hot per-frame case never resizes the canvas or rebuilds tiling.
	$effect(() => {
		requestRedraw
		render()
	})

	// The board's content dimensions changed (editor resized the map, or first
	// mount). This genuinely needs a reflow to resize the canvas and recompute
	// scroll bounds; `reflow` itself no-ops if nothing actually changed.
	$effect(() => {
		contentWidth
		contentHeight
		reflow?.()
	})
</script>

<!--
	Call `reflow` through a wrapper, not `on:resize={reflow}` directly: `reflow`
	is assigned inside `onMount`, so it is still `undefined` when the window
	listener is wired up. Binding the bare reference captures that `undefined`
	and the board never recomputes its canvas size, scroll bounds, or screen
	anchor on resize — shrinking the window then leaves the map cut off with no
	way to scroll it back into view. The closure reads the current `reflow` at
	event time instead.
-->
<svelte:window onresize={() => reflow?.()} />

<section
	role="grid"
	tabindex="0"
	bind:this={container}
	onpointerdown={() => container?.focus({ preventScroll: true })}
	onclick={(e) => {
		if (!scroller) return
		e.stopPropagation()
		e.preventDefault()
		click(boardRect, scroller)(handleClick)(e)
	}}
	onkeypress={(e) => {
		e.stopPropagation()
		e.preventDefault()
		keypress(handleKeypress)(e)
	}}
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
		touchend(scroller)(e)
	}}
	ontouchcancel={(e) => {
		if (!scroller) return
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
		if (!scroller) return
		e.stopPropagation()
		e.preventDefault()
		mousemove(boardRect, scroller)(handleHover)(e)
	}}
	class="h-full outline-none"
>
	<canvas bind:this={content}></canvas>
</section>
