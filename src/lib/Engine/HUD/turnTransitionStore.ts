/**
 * turnTransitionStore — the gate flag that the turn-transition overlay
 * sets while it plays, so the rest of the engine can pause until it finishes.
 *
 *  - GameStateManager refuses to schedule a CPU turn while this is true,
 *  - the local player's input and the End Turn button are inert,
 *  - and the auto-end-turn watcher skips its check.
 *
 * The overlay component owns writes; everyone else just reads.
 */

import { writable } from 'svelte/store'

export const turnTransitionActive = writable<boolean>(false)

/** Single source of truth for the slide-in/hold/slide-out total duration. */
export const TURN_TRANSITION_MS = 900
