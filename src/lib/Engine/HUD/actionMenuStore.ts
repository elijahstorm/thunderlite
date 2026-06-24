import { writable } from 'svelte/store'
import type { ActionMenuItem } from '../actions'

export type ActionMenuState = {
	open: boolean
	// "Peek" — the post-move menu has been dismissed to let the player look around
	// the board (no veil, free panning) WITHOUT resolving the unit. The unit it
	// belongs to is still mid-decision, so the menu can be re-summoned by a tap.
	// This is distinct from `open`: while peeking the panel is hidden but the
	// pending unit (unitTile/team/items) is remembered so it can pop back up.
	peeking: boolean
	// Whether the unit already moved before this menu opened. The post-move menu
	// (moved: true) can't be undone, so dismissing it only peeks. The in-place
	// double-click menu (moved: false) committed nothing, so it offers a real
	// cancel that fully deselects the unit without idling it.
	moved: boolean
	unitTile: number | null
	team: number | null
	items: ActionMenuItem[]
}

const closed = (): ActionMenuState => ({
	open: false,
	peeking: false,
	moved: false,
	unitTile: null,
	team: null,
	items: [],
})

export const actionMenuState = writable<ActionMenuState>(closed())

export const openActionMenu = (
	unitTile: number,
	team: number,
	items: ActionMenuItem[],
	moved = true
): void => {
	actionMenuState.set({ open: true, peeking: false, moved, unitTile, team, items })
}

// Hide the panel but keep the pending unit — the player is peeking at the board.
// No-op (stays closed) if there's nothing to peek at.
export const peekActionMenu = (): void => {
	actionMenuState.update((s) =>
		s.open && s.unitTile !== null ? { ...s, open: false, peeking: true } : s
	)
}

export const closeActionMenu = (): void => {
	actionMenuState.set(closed())
}
