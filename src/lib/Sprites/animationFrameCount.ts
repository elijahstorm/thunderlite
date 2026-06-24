import { writable } from 'svelte/store'

export const animationFrame = writable<number>(0)

// Combat overlays (attack swings, explosions) play their sprite sheets off this
// faster clock instead of `animationFrame`. Movement steps and idle unit cycling
// stay on the slow `animationFrame` beat; locking explosions/attacks to the same
// 200ms tick made them crawl (~5fps over 8-14 frame sheets = 1.6-2.8s each).
export const overlayFrame = writable<number>(0)

// --- Global animation clock (singleton) ---------------------------------------
// The tick is a *global clock*, not per-component state. It used to live in
// writable stores holding the setTimeout handle, with each MapRender instance
// (main board + minimap) reading its own cached copy of the store to guard
// `if (!timer) start()`. Under Svelte's reactive-flush / mount-unmount ordering
// two instances could both observe a null handle and each start a setTimeout
// chain, so `animationFrame` advanced twice per tick — the intermittent
// "animation runs too fast" bug. Holding the handles in plain module variables
// makes the guard a genuinely atomic, process-wide singleton: a second caller
// always sees the live handle synchronously and no-ops. Ref counting keeps the
// clock alive while any non-paused board is mounted and tears it down with the
// last one.
let frameTimer: ReturnType<typeof setTimeout> | null = null
let overlayTimer: ReturnType<typeof setTimeout> | null = null
let clockRefs = 0

/**
 * Register a non-paused board as a clock consumer and ensure the singleton
 * tick chains are running. Idempotent: extra callers only bump the ref count.
 */
export function startAnimationClock(frameMs: number, overlayMs: number): void {
	clockRefs += 1

	if (frameTimer === null) {
		const tick = () => {
			animationFrame.update((frame) => (frame + 1) % 100000)
			frameTimer = setTimeout(tick, frameMs)
		}
		frameTimer = setTimeout(tick, frameMs)
	}

	if (overlayTimer === null) {
		const tick = () => {
			overlayFrame.update((frame) => (frame + 1) % 100000)
			overlayTimer = setTimeout(tick, overlayMs)
		}
		overlayTimer = setTimeout(tick, overlayMs)
	}
}

/**
 * Release one clock consumer. The tick chains keep running until the last
 * non-paused board releases, then both are cancelled.
 */
export function stopAnimationClock(): void {
	clockRefs = Math.max(0, clockRefs - 1)
	if (clockRefs > 0) return

	if (frameTimer !== null) {
		clearTimeout(frameTimer)
		frameTimer = null
	}
	if (overlayTimer !== null) {
		clearTimeout(overlayTimer)
		overlayTimer = null
	}
}
