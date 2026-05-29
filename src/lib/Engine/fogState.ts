import { writable } from 'svelte/store'

// True only when the current board is being rendered with fog of war enabled.
// Engine code (attack list, threat reach, AI) consults this so that the action
// model matches what the player can actually see. Campaign / editor / hot-seat
// boards run with fog off and should ignore sight when listing valid targets.
export const fogOfWarEnabled = writable<boolean>(false)
