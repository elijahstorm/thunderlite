import type {
	KeyboardEventHandler,
	MouseEventHandler,
	TouchEventHandler,
	WheelEventHandler,
} from 'svelte/elements'
import type { Scroller } from './Scroller'

export const click =
	(getRect: () => DOMRect, scroller: Scroller) =>
	(click: (x: number, y: number) => void): MouseEventHandler<HTMLElement> =>
	(e) => {
		// Resolve the rect (and its centring offset) per event so a window resize
		// that moved or resized the board takes effect on the very next click.
		const rect = getRect()
		return validate(preventOnForms, minimalMouseMovement(scroller))(
			click,
			e.clientX - rect.left + scroller.__scrollLeft,
			e.clientY - rect.top + scroller.__scrollTop
		)(e)
	}
export const keypress =
	(keypress: (key: string, shiftKey: boolean) => void): KeyboardEventHandler<HTMLElement> =>
	(e) =>
		validate(preventOnForms, validateEnter as (e: Event) => boolean)(keypress, e.key, e.shiftKey)(e)

// Arrow keys nudge the camera exactly one tile at a time. Arrow presses fire
// `keydown` (never `keypress`), so this is a separate path from the Enter-only
// `keypress` handler above. `scrollBy` clamps to the map bounds, so pressing
// into an edge is a no-op rather than scrolling past the board.
export const keydown =
	(scroller: Scroller, tileWidth: number, tileHeight: number): KeyboardEventHandler<HTMLElement> =>
	(e) => {
		if (!preventOnForms(e)) return
		let dx = 0
		let dy = 0
		switch (e.key) {
			case 'ArrowLeft':
				dx = -tileWidth
				break
			case 'ArrowRight':
				dx = tileWidth
				break
			case 'ArrowUp':
				dy = -tileHeight
				break
			case 'ArrowDown':
				dy = tileHeight
				break
			default:
				return
		}
		e.preventDefault()
		scroller.scrollBy(dx, dy, true)
	}

// Two-finger trackpad drags (and mouse wheels) arrive as `wheel` events with
// pixel deltas; pan the board by them. deltaMode 1/2 report line/page units
// instead of pixels, so scale those up to a sensible pixel step. preventDefault
// is applied via the `|preventDefault` modifier at the call site so the page
// itself never scrolls or zooms underneath the board.
export const wheel =
	(scroller: Scroller): WheelEventHandler<HTMLElement> =>
	(e) => {
		if (!preventOnForms(e)) return
		const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.__clientHeight : 1
		scroller.scrollBy(e.deltaX * scale, e.deltaY * scale, false)
	}

export const touchstart =
	(scroller: Scroller): TouchEventHandler<HTMLElement> =>
	(e) =>
		validate(preventOnForms)(scroller.doTouchStart, e.touches, e.timeStamp)(e)
export const touchmove =
	(scroller: Scroller): TouchEventHandler<HTMLElement> =>
	(e) =>
		scroller.doTouchMove(e.touches, e.timeStamp)
export const touchend =
	(scroller: Scroller): TouchEventHandler<HTMLElement> =>
	(e) =>
		scroller.doTouchEnd(e.timeStamp)
export const touchcancel =
	(scroller: Scroller): TouchEventHandler<HTMLElement> =>
	(e) =>
		scroller.doTouchEnd(e.timeStamp)

export const mousedown =
	(scroller: Scroller): MouseEventHandler<HTMLElement> =>
	(e) =>
		validate(preventOnForms)(
			scroller.doTouchStart,
			[
				{
					clientX: e.clientX,
					clientY: e.clientY,
				},
			] as unknown as TouchList,
			e.timeStamp
		)(e)
export const mouseup =
	(scroller: Scroller): MouseEventHandler<HTMLElement> =>
	(e) =>
		scroller.doTouchEnd(e.timeStamp)
export const contextmenu =
	(scroller: Scroller): MouseEventHandler<HTMLElement> =>
	(e) =>
		scroller ?? e
export const mousemove =
	(getRect: () => DOMRect, scroller: Scroller) =>
	(mousemove: (x: number, y: number) => void): MouseEventHandler<HTMLElement> =>
	(e) => {
		const rect = getRect()
		return otherwise(scrollerIsScrolling)(
			scroller.doTouchMove,
			[
				{
					clientX: e.clientX,
					clientY: e.clientY,
				},
			] as unknown as TouchList,
			e.timeStamp
		)(
			mousemove,
			e.clientX - rect.left + scroller.__scrollLeft,
			e.clientY - rect.top + scroller.__scrollTop
		)(scroller)
	}

const otherwise =
	(validation: (scroller: Scroller) => boolean) =>
	<T, R>(action: (...args: [T, R]) => void, ...args: [T, R]) =>
	<L, K>(otherwise: (...otherArgs: [L, K]) => void, ...otherArgs: [L, K]) =>
	(scroller: Scroller) =>
		validation(scroller) ? action(...args) : otherwise(...otherArgs)

const validate =
	(...validations: ((e: Event) => boolean)[]) =>
	<T, R>(action: (...args: [T, R]) => void, ...args: [T, R]) =>
	(e: Event) =>
		validations.reduce((valid, validator) => (valid ? validator(e) : false), true)
			? action(...args)
			: null

const validateEnter = (e: KeyboardEvent) => e.key === 'Enter'
const preventOnForms = (e: Event) =>
	(e.target as HTMLElement).tagName.match(/input|textarea|select/i) ? false : true
const minimalMouseMovement = (scroller: Scroller) => (e: Event) =>
	Math.abs(scroller.__initialTouchLeft - (e as MouseEvent).clientX) < 10 &&
	Math.abs(scroller.__initialTouchTop - (e as MouseEvent).clientY) < 10
const scrollerIsScrolling = (scroller: Scroller) => scroller.__isTracking
