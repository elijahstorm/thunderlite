import { get, writable } from 'svelte/store'
import type { ViewerFog } from './visibility'

// True only when the current board is being rendered with fog of war enabled.
// Engine code (attack list, threat reach, AI) consults this so that the action
// model matches what the player can actually see. Campaign / editor / hot-seat
// boards run with fog off and should ignore sight when listing valid targets.
export const fogOfWarEnabled = writable<boolean>(false)

// Snapshot of the local viewer's fog-of-war reach, mirrored from `MapRender`'s
// cached visibility computation. Null means fog is off (everything visible).
// The DOM Animator overlay reads this to suppress walking/attacking/explosion
// animations on tiles the viewer can't see — otherwise an enemy step through
// fog would still flash its sprite above the dimmed canvas tile. Carries both
// the ground reach and the wider air reach (see `unitSeenByViewer`).
export const viewerVisibility = writable<ViewerFog | null>(null)

// A team's sight, snapshotted the instant one of its units starts a move and held
// until that unit's post-move decision resolves (wait / attack / capture / cancel /
// collision / turn end). While held, both the fog the local player sees and the
// attack list they're offered are computed from this pre-move reach rather than
// the live board. Otherwise a unit could step into the dark, reveal an enemy it
// happened to land beside, and shoot it in the same action: a free hit the enemy
// had no chance to see coming. The reveal still happens, just after the choice is
// made. Set by `freezeSight` (visibility.ts), cleared by `releaseSight`.
export type FrozenSight = { team: number; visible: Set<number>; airVisible: Set<number> }
export const frozenSight = writable<FrozenSight | null>(null)

// The held pre-move sight for `team`, or null when nothing is frozen for it. Sight
// is only ever frozen for the local, human-driven team, so the CPU planner and any
// other team always read the live board.
export const heldSight = (team: number): FrozenSight | null => {
	const held = get(frozenSight)
	return held !== null && held.team === team ? held : null
}

export const releaseSight = (): void => {
	if (get(frozenSight) !== null) frozenSight.set(null)
}
