import { writable } from 'svelte/store'
import type { ActionMenuItem } from '../actions'

export type ActionMenuState = {
	open: boolean
	unitTile: number | null
	team: number | null
	items: ActionMenuItem[]
}

const closed = (): ActionMenuState => ({
	open: false,
	unitTile: null,
	team: null,
	items: [],
})

export const actionMenuState = writable<ActionMenuState>(closed())

export const openActionMenu = (
	unitTile: number,
	team: number,
	items: ActionMenuItem[]
): void => {
	actionMenuState.set({ open: true, unitTile, team, items })
}

export const closeActionMenu = (): void => {
	actionMenuState.set(closed())
}
