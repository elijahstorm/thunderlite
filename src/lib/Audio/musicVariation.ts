import type { MusicMix } from '$lib/Audio/audioEngine'
import type { MusicPack } from '$lib/Audio/musicPacks'

/**
 * Adaptive music variation — the pure half of the "stop being repetitive"
 * machinery.
 *
 * A pack (see `musicPacks.ts`) is one composition delivered as independent
 * stems, all looping in lockstep. Every stem is safe to raise or drop in any
 * combination, so an arrangement is just a choice of subset:
 *
 *  - the FOUNDATION layer, which holds the harmony and is up in every mood
 *    except `silent`, and
 *  - some number of EXTRAS, drawn from the pack's freely combinable layers.
 *
 * Mood sets the budget: how many extras, and how loud. Ranges are expressed as
 * fractions of the pool rather than absolute counts, so the same mood table
 * works for a three-layer pack and a five-layer one — buying a bigger pack later
 * widens the variation space without touching this file.
 *
 * On top sits FATIGUE. A mood that overstays its welcome thins itself out:
 * extras drop away and the whole bed sits back. This is the actual fix for "I
 * muted it because it was repetitive" — the music sags through a long CPU grind,
 * so your own turn snapping back to the full arrangement reads as an event
 * rather than as more wallpaper. Nothing here fights the composer; it only ever
 * plays subsets the pack was built to support.
 *
 * Everything is a pure function of (mood, variation, dwell, seed, pool size), so
 * an arrangement is reproducible. That matters beyond testability: replays
 * re-run a match from a seed and should sound the same the second time through.
 */

/**
 * Intensity moods the director maps game phase onto. `silent` and `rest` are the
 * two ways the bed gets out of the way.
 */
export type MusicMood = 'silent' | 'rest' | 'thinking' | 'ally' | 'enemy' | 'player' | 'hurry'

/** How a mood is allowed to arrange itself, independent of any pack's size. */
export interface MoodSpec {
	/** Raise the pack's foundation layer. */
	foundation: boolean
	/** Lower bound on extras, as a fraction of the pool (0..1). */
	minExtra: number
	/** Upper bound on extras, as a fraction of the pool (0..1). */
	maxExtra: number
	/** Gain ceiling applied to every raised layer. */
	level: number
}

/**
 * Per-mood arrangement budgets.
 *
 * The ranges overlap deliberately. Adjacent moods sharing a layer count means a
 * turn flip does not always produce an audible jump, which keeps the music from
 * feeling like a state readout. The levels still separate them, so over a match
 * the moods read as distinct.
 */
export const MOOD_SPECS: Readonly<Record<MusicMood, MoodSpec>> = {
	// Terminal. The win/lose sting owns the moment; the bed gets out of its way.
	silent: { foundation: false, minExtra: 0, maxExtra: 0, level: 0 },
	// Deliberate breathing room: foundation only, well back. Silence resets the
	// ear, which is what makes the next full arrangement land.
	rest: { foundation: true, minExtra: 0, maxExtra: 0, level: 0.5 },
	// CPU is computing. Sparse and unresolved — this is dead air, not a set piece.
	thinking: { foundation: true, minExtra: 0, maxExtra: 0.5, level: 0.7 },
	ally: { foundation: true, minExtra: 0.5, maxExtra: 0.5, level: 0.85 },
	enemy: { foundation: true, minExtra: 0.5, maxExtra: 1, level: 0.9 },
	// Your turn: the fullest the bed normally gets.
	player: { foundation: true, minExtra: 0.5, maxExtra: 1, level: 1 },
	// Hurry-up warning. Everything on, and immune to fatigue (see `extrasBudget`).
	hurry: { foundation: true, minExtra: 1, maxExtra: 1, level: 1 },
}

/** Phrases in one mood before fatigue takes another step. */
export const FATIGUE_PHRASES = 6
/** Gain multiplier per fatigue step. */
const FATIGUE_LEVEL_FALLOFF = 0.88
/** Fatigue never pulls the bed below this fraction of the mood's level. */
const FATIGUE_LEVEL_FLOOR = 0.55
/** Moods that refuse to thin out — they exist precisely to grab attention. */
const FATIGUE_IMMUNE: readonly MusicMood[] = ['silent', 'hurry']

const clamp01 = (value: number): number =>
	Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

/** How many fatigue steps `dwell` phrases in one mood have accumulated. */
export function fatigueSteps(dwell: number): number {
	if (!Number.isFinite(dwell) || dwell <= 0) return 0
	return Math.floor(dwell / FATIGUE_PHRASES)
}

/** A mood's budget resolved against a concrete pack size and dwell time. */
export interface ExtrasBudget {
	foundation: boolean
	/** Inclusive bounds on how many extras to raise. */
	min: number
	max: number
	level: number
}

/**
 * Resolve a mood into a concrete budget for a pool of `poolSize` extras, thinned
 * by however long the mood has overstayed.
 *
 * Fatigue pulls `max` toward `min` and eases the level back, but never below
 * `FATIGUE_LEVEL_FLOOR`, so a stale mood decays into background rather than into
 * an awkward silence. `min` is never touched: every mood keeps its floor, so
 * fatigue can thin the arrangement but cannot strip a mood of its identity.
 */
export function extrasBudget(mood: MusicMood, dwell: number, poolSize: number): ExtrasBudget {
	const spec = MOOD_SPECS[mood]
	const pool = Math.max(0, Math.trunc(poolSize))
	const scale = (fraction: number): number => Math.min(pool, Math.round(clamp01(fraction) * pool))

	const min = scale(spec.minExtra)
	const ceiling = Math.max(min, scale(spec.maxExtra))
	const steps = FATIGUE_IMMUNE.includes(mood) ? 0 : fatigueSteps(dwell)

	return {
		foundation: spec.foundation,
		min,
		max: Math.max(min, ceiling - steps),
		level:
			steps === 0
				? spec.level
				: Math.max(spec.level * FATIGUE_LEVEL_FLOOR, spec.level * FATIGUE_LEVEL_FALLOFF ** steps),
	}
}

/** One concrete thing to play. */
export interface MusicArrangement {
	foundation: boolean
	/** Indices into the pack's `extras`, ascending. */
	extras: readonly number[]
	/** Gain for every raised layer. */
	level: number
}

/** All ascending index tuples of length `k` drawn from `0..count-1`. */
function subsetsOfSize(count: number, k: number): number[][] {
	if (k <= 0) return [[]]
	if (k > count) return []
	const out: number[][] = []
	const acc: number[] = []
	const walk = (start: number): void => {
		if (acc.length === k) {
			out.push([...acc])
			return
		}
		for (let i = start; i < count; i++) {
			acc.push(i)
			walk(i + 1)
			acc.pop()
		}
	}
	walk(0)
	return out
}

/**
 * Turn any stable match identifier into an arrangement seed. Same match id →
 * same arrangement, which is what lets a replay sound like the match it replays.
 */
export function seedFromString(text: string): number {
	return hash32(text)
}

/** FNV-1a. Small, stable across runs, good enough to seed a PRNG. */
function hash32(text: string): number {
	let h = 0x811c9dc5
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i)
		h = Math.imul(h, 0x01000193)
	}
	return h >>> 0
}

/** mulberry32 — tiny deterministic PRNG. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** Fisher-Yates against a supplied PRNG. Does not mutate `items`. */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
	const out = [...items]
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1))
		;[out[i], out[j]] = [out[j], out[i]]
	}
	return out
}

/**
 * Every distinct arrangement a (possibly fatigued) mood permits over a pool of
 * `poolSize` extras, in a seed-shuffled order.
 *
 * Because the cycle holds only distinct arrangements, indexing it with
 * consecutive variation numbers can never repeat an arrangement back to back —
 * including across the wrap. That is the whole point: exact repetition is what
 * the ear latches onto, so the cycle structurally rules it out and every
 * arrangement gets aired before any of them comes round again.
 */
export function variationCycle(
	mood: MusicMood,
	dwell: number,
	seed: number,
	poolSize: number
): MusicArrangement[] {
	const budget = extrasBudget(mood, dwell, poolSize)
	const out: MusicArrangement[] = []
	for (let k = budget.min; k <= budget.max; k++) {
		for (const extras of subsetsOfSize(Math.max(0, Math.trunc(poolSize)), k)) {
			out.push({ foundation: budget.foundation, extras, level: budget.level })
		}
	}
	if (out.length === 0) {
		out.push({ foundation: budget.foundation, extras: [], level: budget.level })
	}
	return shuffled(out, mulberry32(hash32(`${mood}:${seed}:${poolSize}`)))
}

/**
 * The arrangement for a given point in a mood. `variation` advances on its own
 * clock (see `musicClock`), `dwell` counts phrases spent in this mood.
 */
export function arrangementFor(
	mood: MusicMood,
	variation: number,
	dwell: number,
	seed: number,
	poolSize: number
): MusicArrangement {
	const cycle = variationCycle(mood, dwell, seed, poolSize)
	const index = ((Math.trunc(variation) % cycle.length) + cycle.length) % cycle.length
	return cycle[index]
}

/** Expand an arrangement into per-layer gains for a concrete pack. */
export function mixForArrangement(arrangement: MusicArrangement, pack: MusicPack): MusicMix {
	const level = clamp01(arrangement.level)
	if (level === 0) return {}
	const mix: Record<string, number> = {}
	if (arrangement.foundation) mix[pack.foundation] = level
	for (const index of arrangement.extras) {
		const layer = pack.extras[index]
		if (layer !== undefined) mix[layer] = level
	}
	return mix
}

/** Convenience: mood + clock position + pack → per-layer gains. */
export function mixForMood(
	mood: MusicMood,
	variation: number,
	dwell: number,
	seed: number,
	pack: MusicPack
): MusicMix {
	return mixForArrangement(arrangementFor(mood, variation, dwell, seed, pack.extras.length), pack)
}
