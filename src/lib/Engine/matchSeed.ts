/**
 * matchSeed — the one random seed a match is played under.
 *
 * Everything in the game that is "random" is really a draw from this seed:
 * the CPU's tie-breaking, a `random unit` reinforcement wave, and whatever
 * seeded mechanics come later. Making it one explicit, stored number rather
 * than a scatter of `Math.random()` calls is what buys three properties at once:
 *
 *  - **Every client agrees.** In an online room the seed lives on the room row,
 *    so a player who rejoins mid-match — or a second client that has never
 *    planned a CPU turn — draws exactly what everyone else drew. A scripted map
 *    played online is the sharp case: script beats bypass the action log
 *    entirely, so if two clients rolled different reinforcements their boards
 *    would silently diverge.
 *  - **A match resumes as itself.** A campaign level's seed rides in its save,
 *    so Continue picks up the same match. Restart deliberately takes a NEW seed,
 *    which is what makes a replayed level play differently.
 *  - **A finished match can be reviewed.** The seed is stamped onto the `matches`
 *    row, so a replay can reconstitute the same rolls the players saw.
 *
 * ## Streams
 *
 * A single seed has to serve unrelated consumers without them colliding — two
 * features that happened to draw on the same coordinates would otherwise move in
 * lockstep. {@link matchRandom} takes a *stream name* that is mixed into the key,
 * so each consumer gets its own independent sequence out of the same seed. New
 * seeded mechanics should claim a name in {@link SeedStream} rather than invent
 * coordinates and hope they don't clash.
 *
 * The CPU planner deliberately draws un-namespaced (`cpuRandom`): it was here
 * first and its whole regression suite is pinned to that sequence.
 *
 * ## Determinism
 *
 * Draws are stateless — `matchRandom(stream, ...coords)` is a pure function of
 * the installed seed and the coordinates, never of how many draws came before.
 * That is what lets two consumers resolve the same thing independently (the
 * spawn telegraph a turn before the runner fires it) and lets a re-parse after a
 * page reload land on the answer already shown.
 */

import { cpuRandom, setCpuSeed } from './cpuAi/rng'

/**
 * Named draw streams. One entry per seeded mechanic; the name is mixed into
 * every key so streams never interfere.
 */
export const SeedStream = {
	/** `random unit` reinforcement waves in a level script. */
	ScriptSpawn: 'script:spawn',
} as const

export type SeedStreamName = (typeof SeedStream)[keyof typeof SeedStream] | (string & {})

/**
 * Session ids that are not a shared room: the editor's "play this map" hand-off
 * and the dev harness both reuse one literal for every match, so hashing them
 * would give every playthrough the same seed. These get a fresh seed instead.
 */
const PLACEHOLDER_SESSIONS: ReadonlySet<string> = new Set(['', 'ephemeral', 'testSession'])

/** True for a session id that identifies one real shared room. */
export const isSharedSession = (session: string | null | undefined): boolean =>
	!!session && !PLACEHOLDER_SESSIONS.has(session)

/** FNV-1a — small and stable across runs, which is all a seed derivation needs. */
const hashString = (value: string): number => {
	let h = 0x811c9dc5
	for (let i = 0; i < value.length; i++) {
		h ^= value.charCodeAt(i)
		h = Math.imul(h, 0x01000193)
	}
	return h >>> 0
}

/**
 * A fresh unpredictable seed. Prefers the platform CSPRNG so two matches started
 * in the same millisecond can't collide, and falls back to `Math.random` on any
 * runtime without it (older Node in a headless test, say).
 */
export const randomMatchSeed = (): number => {
	const crypto = globalThis.crypto
	if (crypto?.getRandomValues) {
		return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0
	}
	return Math.floor(Math.random() * 0x100000000) >>> 0
}

/** The seed a room's session id implies, for rooms created before seeds were stored. */
export const seedFromSession = (session: string): number => hashString(session)

/** Where a match's seed can come from, in priority order. */
export interface MatchSeedSource {
	/** A seed already decided for this match: a room row, or a campaign save. */
	seed?: number | null
	/** The room's session id — the fallback for rooms predating stored seeds. */
	gameSession?: string | null
}

/**
 * Decide which seed a match plays under.
 *
 * A stored seed always wins. Failing that, a real shared session hashes to a
 * value every client derives identically, so a room created before seeds were
 * stored still keeps its clients in step (it just repeats if that same room is
 * somehow replayed). Anything else — hot seat, the editor, a campaign level
 * starting fresh — gets a brand new seed, which is what stops a level from
 * playing out identically every time.
 */
export const resolveMatchSeed = (source: MatchSeedSource): number => {
	const stored = source.seed
	if (typeof stored === 'number' && Number.isFinite(stored)) return stored >>> 0
	if (isSharedSession(source.gameSession)) return seedFromSession(source.gameSession as string)
	return randomMatchSeed()
}

let current = 0

/**
 * Install the seed for the match about to be played. Call once per match, before
 * anything can draw — the CPU's first plan, the script's first telegraph.
 * Returns the installed value so a caller can persist it.
 */
export const setMatchSeed = (seed: number): number => {
	current = seed >>> 0
	setCpuSeed(current)
	return current
}

/** The seed this match is being played under (0 before one is installed). */
export const currentMatchSeed = (): number => current

/** Resolve and install in one step. Returns the installed seed. */
export const beginMatchWithSeed = (source: MatchSeedSource): number =>
	setMatchSeed(resolveMatchSeed(source))

/**
 * One sample in `[0, 1)` for `stream`, keyed by `coords`.
 *
 * Pass coordinates that *identify the decision* — a turn number, a tile, a
 * script line — not a running counter. Same seed and same coordinates always
 * give the same number, which is the property every consumer here relies on.
 */
export const matchRandom = (stream: SeedStreamName, ...coords: number[]): number =>
	cpuRandom(hashString(stream), ...coords)
