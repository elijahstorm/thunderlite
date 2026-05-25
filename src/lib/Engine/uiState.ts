import { writable, derived } from 'svelte/store'

export const hoverTile = writable<number | null>(null)
export const selectedTile = writable<number | null>(null)

export const focusedTile = derived(
	[selectedTile, hoverTile],
	([$selected, $hover]) => ($selected ?? $hover)
)

export const setHoverTile = (tile: number | null): void => hoverTile.set(tile)
export const setSelectedTile = (tile: number | null): void => selectedTile.set(tile)
export const clearSelectedTile = (): void => selectedTile.set(null)
