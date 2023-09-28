import { writable } from 'svelte/store'

export const mapStore = writable<MapObject | null>(null)
export const loadedState = writable<boolean>(false)
