import { writable } from 'svelte/store'

export const mapStore = writable<MapObject | null>(null)

// The saved map's `public_id` the in-memory `mapStore` is linked to, or undefined
// for an unsaved new map. Paired with `mapStore` so an editor that resumes
// mid-session (bounced back from Play, or reopened on the bare /editor route)
// re-adopts the map it was editing and saves back to the same row instead of
// minting a duplicate.
export const activeMapIdStore = writable<string | undefined>(undefined)

// Hand-off slot from editor → play page. The editor sets a deep clone here so
// gameplay mutations don't leak back into the editor draft (which lives in
// `mapStore`). The play page consumes and clears it.
export const playMapStore = writable<MapObject | null>(null)
