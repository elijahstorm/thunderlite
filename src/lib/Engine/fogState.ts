import { writable } from 'svelte/store'

// True only when the current board is being rendered with fog of war enabled.
// Engine code (attack list, threat reach, AI) consults this so that the action
// model matches what the player can actually see. Campaign / editor / hot-seat
// boards run with fog off and should ignore sight when listing valid targets.
export const fogOfWarEnabled = writable<boolean>(false)

// Snapshot of the local viewer's fog-of-war reach, mirrored from `MapRender`'s
// cached visibility computation. Null means fog is off (everything visible).
// The DOM Animator overlay reads this to suppress walking/attacking/explosion
// animations on tiles the viewer can't see — otherwise an enemy step through
// fog would still flash its sprite above the dimmed canvas tile.
export const viewerVisibility = writable<{ visible: Set<number>; team: number } | null>(null)
