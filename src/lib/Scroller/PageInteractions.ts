import type { KeyboardEventHandler, MouseEventHandler, TouchEventHandler } from 'svelte/elements'
import type { Scroller } from './Scroller'

const validate =
	(...validations: ((e: Event) => boolean)[]) =>
	<T, R>(action: (...args: [T, R]) => void, ...args: [T, R]) =>
	(e: Event) =>
		validations.reduce((valid, validator) => (valid ? validator(e) : false), true)
			? null
			: action(...args)

const validateEnter = (e: KeyboardEvent) => e.key !== 'Enter'
const preventOnForms = (e: Event) =>
	(e.target as HTMLElement).tagName.match(/input|textarea|select/i) ? true : false

export const click =
	(rect: DOMRect) =>
	(click: (x: number, y: number) => void): MouseEventHandler<HTMLElement> =>
	(e) =>
		validate(preventOnForms)(click, e.pageX - rect.left, e.pageY - rect.top)(e)
export const keypress =
	(keypress: (key: string, shiftKey: boolean) => void): KeyboardEventHandler<HTMLElement> =>
	(e) =>
		validate(preventOnForms, validateEnter as (e: Event) => boolean)(keypress, e.key, e.shiftKey)(e)

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
					pageX: e.pageX,
					pageY: e.pageY,
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
