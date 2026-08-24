import { writable } from 'svelte/store'

/**
 * Width in CSS px that the runtime HUD occupies along the right edge of the
 * viewport, published by `HUDRoot` as its rail is measured / collapsed.
 *
 * The gameplay board reads this and reserves exactly that much room on its own
 * right edge (see `MapRender`), so the rail sits in a gutter beside the map
 * instead of floating on top of it. Before this existed the HUD was a fixed
 * top-right stack: every tile underneath it was unclickable, because the panels
 * — not the board — received the pointer events. Reserving the space is the only
 * fix that holds regardless of how tall or wide the HUD grows.
 *
 * Screen-space overlays that anchor themselves to a tile (the post-move
 * ActionMenu) also subtract this when clamping, so they never slide under the
 * rail.
 *
 * `0` whenever no HUD is mounted (editor, minimap-only, menus).
 */
export const hudGutter = writable(0)

export const setHudGutter = (px: number): void => {
	hudGutter.set(Math.max(0, Math.round(px)))
}

export const clearHudGutter = (): void => {
	hudGutter.set(0)
}
