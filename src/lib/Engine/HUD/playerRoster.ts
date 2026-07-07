import { writable } from 'svelte/store'

/**
 * Public profile for each side in the current match, keyed by team number, so
 * the in-game player list can render real usernames + avatars instead of the
 * generic "Player N" label. Populated by the `/play` route (which maps the
 * seat-ordered server roster onto teams via the same stable order the seat
 * wiring uses) and empty for hotseat/CPU matches or before it resolves.
 */
export const playerRoster = writable<Record<number, UserDBData>>({})
