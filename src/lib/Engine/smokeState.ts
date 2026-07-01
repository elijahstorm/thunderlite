import { writable, get } from 'svelte/store'

// Tiles currently blanketed by a Shroud's smoke screen, mapped to the number of
// turns of cover remaining. Smoke conceals exactly like Forest — distant viewers
// see only the cloud, not the units under it (see visibility.isConcealingTerrain)
// — and decays one step per turn transition (see turnLoop.endTurn). It lives in
// its own store, outside gameState, so the visibility layer can read it without a
// circular import.
export const smokeTiles = writable<Map<number, number>>(new Map())

/** Lay (or refresh) smoke on `tiles` for `ttl` turns, keeping the longer of any
 * existing and the new duration so overlapping screens don't cut each other short. */
export const addSmoke = (tiles: number[], ttl: number): void => {
	smokeTiles.update((current) => {
		const next = new Map(current)
		for (const tile of tiles) next.set(tile, Math.max(next.get(tile) ?? 0, ttl))
		return next
	})
}

/** Age every smoke tile by one turn, dropping any that have expired. */
export const decaySmoke = (): void => {
	smokeTiles.update((current) => {
		const next = new Map<number, number>()
		for (const [tile, ttl] of current) {
			if (ttl > 1) next.set(tile, ttl - 1)
		}
		return next
	})
}

export const isSmokeConcealed = (tile: number): boolean => get(smokeTiles).has(tile)

export const resetSmoke = (): void => smokeTiles.set(new Map())
