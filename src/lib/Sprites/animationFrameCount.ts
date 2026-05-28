import { writable } from 'svelte/store'

export const animationFrame = writable<number>(0)

export const animationTimer = writable<ReturnType<typeof setTimeout> | null>()
