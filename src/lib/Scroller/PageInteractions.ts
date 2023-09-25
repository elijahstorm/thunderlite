import type { MouseEventHandler, TouchEventHandler } from 'svelte/elements'
import type { Scroller } from './Scroller'

const preventOnForms =
	(
		action: (touches: TouchList, timeStamp: number) => void,
		args: [touches: TouchList, timeStamp: number]
	) =>
	(e: TouchEvent | MouseEvent) =>
		(e.target as HTMLElement).tagName.match(/input|textarea|select/i) ? null : action(...args)

export const ___touchstart =
	(scroller: Scroller): TouchEventHandler<HTMLElement> =>
	(e) =>
		preventOnForms(scroller.doTouchStart, [e.touches, e.timeStamp])(e)
export const ___touchmove =
	(scroller: Scroller): TouchEventHandler<HTMLElement> =>
	(e) =>
		scroller.doTouchMove(e.touches, e.timeStamp)
export const ___touchend =
	(scroller: Scroller): TouchEventHandler<HTMLElement> =>
	(e) =>
		scroller.doTouchEnd(e.timeStamp)
export const ___touchcancel =
	(scroller: Scroller): TouchEventHandler<HTMLElement> =>
	(e) =>
		scroller.doTouchEnd(e.timeStamp)
export const ___mousedown =
	(scroller: Scroller): MouseEventHandler<HTMLElement> =>
	(e) =>
		preventOnForms(scroller.doTouchStart, [
			[
				{
					pageX: e.pageX,
					pageY: e.pageY,
				},
			] as unknown as TouchList,
			e.timeStamp,
		])(e)
export const ___mouseup =
	(scroller: Scroller): MouseEventHandler<HTMLElement> =>
	(e) =>
		scroller.doTouchEnd(e.timeStamp)
export const ___contextmenu =
	(scroller: Scroller): MouseEventHandler<HTMLElement> =>
	(e) =>
		scroller ?? e
export const ___mousemove =
	(scroller: Scroller): MouseEventHandler<HTMLElement> =>
	(e) =>
		scroller.doTouchMove(
			[
				{
					pageX: e.pageX,
					pageY: e.pageY,
				},
			] as unknown as TouchList,
			e.timeStamp
		)
