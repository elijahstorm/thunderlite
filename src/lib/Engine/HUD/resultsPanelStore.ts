/**
 * resultsPanelStore — whether the player has put the results screen away to
 * look at the finished board.
 *
 * The results panel used to be a full-viewport modal that appeared the moment
 * a match ended and could only be left by leaving the match. That hid the one
 * thing most players want right then: the board as it stood at the end. The
 * panel is now dismissable (close button, Escape, or a tap on the board) and
 * comes back from the Results button that takes over the End Turn slot in the
 * HUD rail once the match is decided.
 *
 * `StatsScreen` owns the reset: the flag clears whenever the game phase leaves
 * `gameOver`, so a rematch or the next campaign level opens its results fresh.
 */

import { writable } from 'svelte/store'

export const resultsDismissed = writable(false)

export const showResults = (): void => resultsDismissed.set(false)
export const hideResults = (): void => resultsDismissed.set(true)
export const toggleResults = (): void => resultsDismissed.update((dismissed) => !dismissed)
