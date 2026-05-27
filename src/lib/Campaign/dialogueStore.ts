/**
 * dialogueStore — the bridge between a runner `talk` event and the on-screen
 * dialogue overlay (`Dialogue.svelte`).
 *
 * The runner awaits `talk(...)`; we model that as a promise that resolves only
 * once the player has clicked through every line. `Dialogue.svelte` renders the
 * current line from this store and calls `advanceDialogue` / `skipDialogue` on
 * click. Keeping the queue here (not in the component) means the same promise
 * contract works whether or not a component is mounted, and lets the campaign
 * interface stay free of DOM concerns.
 */

import { get, writable } from 'svelte/store'

export interface DialogueState {
	/** Whether a dialogue is currently on screen. */
	active: boolean
	speaker: string
	/** All lines for the current speaker; `index` selects the visible one. */
	lines: string[]
	index: number
}

const idle = (): DialogueState => ({ active: false, speaker: '', lines: [], index: 0 })

export const dialogueState = writable<DialogueState>(idle())

/** Resolver for the in-flight `showDialogue` promise, if any. */
let resolveCurrent: (() => void) | null = null

/**
 * Show a speaker's lines and return a promise that resolves once the player
 * advances past the last line (or skips). An empty list resolves immediately so
 * the runner never stalls on a no-op `talk`.
 */
export const showDialogue = (speaker: string, lines: string[]): Promise<void> => {
	// A second `talk` should never strand the first promise; close it out first.
	closeDialogue()
	if (lines.length === 0) return Promise.resolve()
	dialogueState.set({ active: true, speaker, lines, index: 0 })
	return new Promise<void>((resolve) => {
		resolveCurrent = resolve
	})
}

/** Advance to the next line, or close (and resolve) after the last one. */
export const advanceDialogue = (): void => {
	const state = get(dialogueState)
	if (!state.active) return
	if (state.index < state.lines.length - 1) {
		dialogueState.set({ ...state, index: state.index + 1 })
		return
	}
	closeDialogue()
}

/** Dismiss the whole dialogue immediately (skip button). */
export const skipDialogue = (): void => {
	if (!get(dialogueState).active) return
	closeDialogue()
}

/** Reset state and resolve the pending promise exactly once. */
const closeDialogue = (): void => {
	dialogueState.set(idle())
	const resolve = resolveCurrent
	resolveCurrent = null
	resolve?.()
}
