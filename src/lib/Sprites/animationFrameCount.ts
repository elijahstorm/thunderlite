import { writable } from 'svelte/store'

export const animationFrame = writable<number>(0)

export const animationTimer = writable<ReturnType<typeof setTimeout> | null>()

// Combat overlays (attack swings, explosions) play their sprite sheets off this
// faster clock instead of `animationFrame`. Movement steps and idle unit cycling
// stay on the slow `animationFrame` beat; locking explosions/attacks to the same
// 200ms tick made them crawl (~5fps over 8-14 frame sheets = 1.6-2.8s each).
export const overlayFrame = writable<number>(0)

export const overlayTimer = writable<ReturnType<typeof setTimeout> | null>()
