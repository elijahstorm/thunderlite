import { writable } from 'svelte/store'

export const mapStore = writable<MapObject | null>(null)
