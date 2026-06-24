import { writable } from 'svelte/store'

/**
 * Screen-space geometry of the live game board, published by the main
 * `TileSelector` as the camera pans/zooms. It lets DOM overlays rendered
 * *outside* the board tree (the post-move ActionMenu) map a tile index back to
 * the pixel where that tile is drawn, so they can anchor themselves to the unit
 * the player just touched instead of floating in the screen centre.
 *
 * `originLeft`/`originTop` are the viewport coordinates of tile (0,0)'s
 * top-left corner — i.e. `section.left - scrollOffset.x`, the exact reference
 * the Animator uses to place unit sprites. A tile's on-screen box is therefore
 * `originLeft + col * cellWidth, originTop + row * cellHeight`.
 *
 * `null` whenever no gameplay board is mounted (menus, editor, minimap-only).
 */
export type BoardGeometry = {
	originLeft: number
	originTop: number
	cellWidth: number
	cellHeight: number
}

export const boardGeometry = writable<BoardGeometry | null>(null)

export const setBoardGeometry = (geometry: BoardGeometry): void => {
	boardGeometry.set(geometry)
}

export const clearBoardGeometry = (): void => {
	boardGeometry.set(null)
}
