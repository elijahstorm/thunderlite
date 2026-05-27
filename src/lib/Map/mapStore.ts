import { writable } from 'svelte/store'

export const mapStore = writable<MapObject | null>(null)

// Hand-off slot from editor → play page. The editor sets a deep clone here so
// gameplay mutations don't leak back into the editor draft (which lives in
// `mapStore`). The play page consumes and clears it.
export const playMapStore = writable<MapObject | null>(null)
