/**
 * randomSpawn — resolves a `random unit` script beat against the match seed.
 *
 * A `randomSpawn` event carries its alternatives, not an answer. Resolving it is
 * a *pure function of the match seed and the event's source line*, drawn from the
 * match's own `SeedStream.ScriptSpawn` stream (`Engine/matchSeed`), which is what
 * makes a scripted wave behave like every other piece of match randomness:
 *
 *  - **Replayable.** A review or replay run at the match's seed rolls the same
 *    tanks onto the same tiles as the original playthrough.
 *  - **Agreed across clients.** Online, the seed comes off the room row, so a
 *    scripted map plays the same wave for everyone — script beats never reach the
 *    action log, so a disagreement here would silently fork the boards.
 *  - **Order-independent.** The runner (when the turn block fires) and the spawn
 *    telegraph (a turn earlier) resolve the same event separately and must agree.
 *    Because nothing here is stateful, they do — no draw order to keep in step,
 *    and no need for the parser to run after the seed is installed.
 *  - **Reload-safe.** A mid-match refresh re-parses the script from scratch; the
 *    key is the source line, not a call counter, so an unfired wave re-resolves
 *    to exactly what was already telegraphed.
 *
 * The seed itself is installed once per match by `GameStateManager`. Left unset
 * it is 0, so headless tests get a fixed, repeatable roll for free.
 */

import { SeedStream, matchRandom } from '$lib/Engine/matchSeed'
import type { CutsceneEvent } from './cutsceneTypes'

type RandomSpawn = Extract<CutsceneEvent, { kind: 'randomSpawn' }>
type ResolvedSpawn = Extract<CutsceneEvent, { kind: 'spawn' }>

/** Which draw on a line: the tile, or the unit type. Kept distinct so a two-way
 * type list and a two-way tile list don't move in lockstep. */
const DRAW_TILE = 0
const DRAW_UNIT = 1

/** Uniform index into a list of `length`, clamped so a stray RNG can't overrun. */
const pickIndex = (length: number, roll: number): number =>
	Math.min(length - 1, Math.max(0, Math.floor(roll * length)))

/**
 * Roll a `randomSpawn` into the concrete `spawn` it stands for.
 *
 * `random` is injectable for tests that want to pin a specific outcome. Left out,
 * the match seed drives it, which is what production always wants.
 */
export const resolveRandomSpawn = (
	event: RandomSpawn,
	random: (...parts: number[]) => number = (...coords) =>
		matchRandom(SeedStream.ScriptSpawn, ...coords)
): ResolvedSpawn => {
	const key = [event.line, event.team, event.units.length, event.tiles.length]
	const tile = event.tiles[pickIndex(event.tiles.length, random(...key, DRAW_TILE))]
	const unit = event.units[pickIndex(event.units.length, random(...key, DRAW_UNIT))]
	return { kind: 'spawn', team: event.team, unit, x: tile.x, y: tile.y }
}

/** A `spawn` unchanged, or the concrete spawn a `randomSpawn` resolves to. */
export const asSpawn = (
	event: CutsceneEvent,
	random?: (...parts: number[]) => number
): ResolvedSpawn | null =>
	event.kind === 'spawn'
		? event
		: event.kind === 'randomSpawn'
			? resolveRandomSpawn(event, random)
			: null
