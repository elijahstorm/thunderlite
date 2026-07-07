import { writable } from 'svelte/store'

/**
 * Cross-component request to open a private DM with a given profile `auth`.
 *
 * The DM overlay lives in the (app) layout (see +layout.svelte, which mounts
 * ChatSocket + ChatRoom). Anywhere under that layout — a game roster name, the
 * in-game group chat, a profile page — can set this to pop the conversation
 * open without threading callbacks through the tree. The layout consumes it and
 * resets it to null.
 */
export const openDmWith = writable<string | null>(null)
