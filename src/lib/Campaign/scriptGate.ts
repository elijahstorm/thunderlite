/**
 * scriptGate — a one-bit lock that freezes the match while a campaign cutscene
 * block is running.
 *
 * A scripted block can mutate the board mid-turn (spawn/kill units, swap
 * terrain, flip building ownership). If the player were moving a unit or the CPU
 * were taking its turn while that happens, the action would resolve against a
 * board the script is concurrently rewriting — the two states desync. So while a
 * block executes, neither side is allowed to act.
 *
 * The campaign mount (`Game.svelte`) raises the gate around each runner block;
 * `GameStateManager` reads it to refuse player `select`, hold off CPU
 * scheduling, and suppress the idle auto-end-turn. Kept as a module store (not
 * runner state) so it stays out of the headless, engine-free runner.
 */

import { writable } from 'svelte/store'

/** True while any campaign block is executing. Read-only to consumers. */
export const campaignScriptActive = writable(false)

// Blocks shouldn't overlap in practice (the gate itself blocks the inputs that
// would advance a turn), but a counter keeps the flag honest if `start` and an
// `enterTurn` ever nest — the gate only drops once the outermost block ends.
let depth = 0

/** Mark a block as begun; raises the gate on the first (outermost) entry. */
export const beginScriptBlock = (): void => {
	if (depth++ === 0) campaignScriptActive.set(true)
}

/** Mark a block as ended; drops the gate once the outermost block ends. */
export const endScriptBlock = (): void => {
	if (depth > 0 && --depth === 0) campaignScriptActive.set(false)
}

// A scripted board mutation (a unit spawn, a terrain reshape) keeps animating for
// a beat after the block that issued it has ended. During that assemble the board
// is still mid-change — a spawned unit is placed but hidden, a terrain swap lands
// partway through — so the same freeze that protects a running block must extend
// over the animation. These share the block depth counter, so the gate only truly
// drops once both the block and every in-flight assemble have finished.

/** Hold the gate open while a scripted spawn/terrain assemble plays. */
export const beginScriptedMutation = (): void => {
	if (depth++ === 0) campaignScriptActive.set(true)
}

/** Release the hold once an assemble has finished. */
export const endScriptedMutation = (): void => {
	if (depth > 0 && --depth === 0) campaignScriptActive.set(false)
}

/**
 * Force the gate open and clear the counter. Called when the campaign mount tears
 * down so a level destroyed mid-block (e.g. navigating away during dialogue)
 * never strands the next mount behind a stuck gate.
 */
export const resetScriptGate = (): void => {
	depth = 0
	campaignScriptActive.set(false)
}
