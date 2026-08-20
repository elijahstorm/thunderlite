import type { MusicMix } from '$lib/Audio/audioEngine'

/**
 * Adaptive music variation — the pure half of the "stop being repetitive"
 * machinery.
 *
 * The music bed is a stack of instrumental LAYERS, not a set of mood tracks.
 * Every layer is the same length, tempo and key, and they all loop together in
 * lockstep (see `audioEngine.startMusicStems`). Two independent dials shape what
 * you actually hear:
 *
 *  - INTENSITY — how deep into the ordered stack we go. `MUSIC_STACK` runs
 *    sparsest → densest and an intensity of N raises its first N layers. It is a
 *    prefix on purpose: commercial adaptive packs ship layers as *cumulative*
 *    intensity tiers (layer 1, layer 1+2, layer 1+2+3), so a prefix is the only
 *    combination the composer actually mixed and checked.
 *  - COLOR — layers outside the stack that are safe to toggle freely, purely for
 *    variety. Packs with genuinely independent stems populate these; a
 *    cumulative-only pack leaves them empty and still gets variation from
 *    intensity wobble alone.
 *
 * On top sits FATIGUE. A mood that overstays its welcome thins itself out:
 * intensity drifts toward the mood's floor, color layers drop away, and the
 * whole bed sits back. This is the actual fix for "I muted it because it was
 * repetitive" — the music sags through a long CPU grind, so your own turn
 * snapping back to the full arrangement reads as an event rather than as more
 * wallpaper. Nothing here fights the composer; it only ever plays subsets the
 * pack was built to support.
 *
 * Everything is a pure function of (mood, variation, dwell, seed), so an
 * arrangement is reproducible. That matters beyond testability: replays re-run a
 * match from a seed and should sound the same the second time through.
 */

/** Cumulative intensity stack, sparsest first. Intensity N raises the first N. */
export const MUSIC_STACK = ['bed', 'pulse', 'bass', 'melody'] as const

/** Independent layers, safe to toggle in any combination. */
export const MUSIC_COLOR = ['accent', 'texture'] as const

export type MusicStackId = (typeof MUSIC_STACK)[number]
export type MusicColorId = (typeof MUSIC_COLOR)[number]
export type MusicLayerId = MusicStackId | MusicColorId

/** Every layer the bed can load, stack first. */
export const MUSIC_LAYERS: readonly MusicLayerId[] = [...MUSIC_STACK, ...MUSIC_COLOR]

/** Manifest key for a layer (see `musicManifest` in assetManifest.ts). */
export function layerTrackId(layer: MusicLayerId): string {
	return `layers/${layer}`
}

/**
 * Intensity moods the director maps game phase onto. Ordered loosely by energy;
 * `silent` and `rest` are the two ways the bed gets out of the way.
 */
export type MusicMood = 'silent' | 'rest' | 'thinking' | 'ally' | 'enemy' | 'player' | 'hurry'

/** How a mood is allowed to arrange itself. */
export interface MoodSpec {
	/** Inclusive stack-depth range variation may choose from. */
	minIntensity: number
	maxIntensity: number
	/** Color layers eligible in this mood. */
	color: readonly MusicColorId[]
	/** How many of `color` to raise at once. */
	colorPick: number
	/** Gain ceiling applied to every raised layer. */
	level: number
}

/**
 * Per-mood arrangement budgets.
 *
 * The ranges overlap deliberately. Adjacent moods sharing an intensity means a
 * turn flip does not always produce an audible jump, which keeps the music from
 * feeling like a state readout. The *distribution* differs, so over a match the
 * moods still read as distinct.
 */
export const MOOD_SPECS: Readonly<Record<MusicMood, MoodSpec>> = {
	// Terminal / stings own the field. Nothing from the bed.
	silent: { minIntensity: 0, maxIntensity: 0, color: [], colorPick: 0, level: 0 },
	// Deliberate breathing room: one layer, well back. Silence resets the ear,
	// which is what makes the next full arrangement land.
	rest: { minIntensity: 1, maxIntensity: 1, color: [], colorPick: 0, level: 0.5 },
	// CPU is computing. Sparse and unresolved — this is dead air, not a set piece.
	thinking: { minIntensity: 1, maxIntensity: 2, color: ['texture'], colorPick: 1, level: 0.7 },
	ally: { minIntensity: 2, maxIntensity: 3, color: ['texture'], colorPick: 1, level: 0.85 },
	enemy: {
		minIntensity: 2,
		maxIntensity: 3,
		color: ['accent', 'texture'],
		colorPick: 1,
		level: 0.9,
	},
	// Your turn: the fullest the bed normally gets.
	player: {
		minIntensity: 3,
		maxIntensity: 4,
		color: ['accent', 'texture'],
		colorPick: 1,
		level: 1,
	},
	// Hurry-up warning. Pinned wide open, and immune to fatigue (see `fatigued`).
	hurry: { minIntensity: 4, maxIntensity: 4, color: ['accent'], colorPick: 1, level: 1 },
}

/** Phrases in one mood before fatigue takes another step. */
export const FATIGUE_PHRASES = 6
/** Gain multiplier per fatigue step. */
const FATIGUE_LEVEL_FALLOFF = 0.88
/** Fatigue never pulls the bed below this fraction of the mood's level. */
const FATIGUE_LEVEL_FLOOR = 0.55
/** Moods that refuse to thin out — they exist precisely to grab attention. */
const FATIGUE_IMMUNE: readonly MusicMood[] = ['silent', 'hurry']

/** How many fatigue steps `dwell` phrases in one mood have accumulated. */
export function fatigueSteps(dwell: number): number {
	if (!Number.isFinite(dwell) || dwell <= 0) return 0
	return Math.floor(dwell / FATIGUE_PHRASES)
}

/**
 * Thin a mood down for having outstayed its welcome. Pulls the intensity ceiling
 * toward the floor, drops color layers first, and eases the whole bed back — but
 * never below `FATIGUE_LEVEL_FLOOR`, so it decays into background rather than
 * into an awkward silence.
 */
export function fatigued(mood: MusicMood, dwell: number): MoodSpec {
	const spec = MOOD_SPECS[mood]
	const steps = FATIGUE_IMMUNE.includes(mood) ? 0 : fatigueSteps(dwell)
	if (steps === 0) return spec
	return {
		...spec,
		maxIntensity: Math.max(spec.minIntensity, spec.maxIntensity - steps),
		colorPick: Math.max(0, spec.colorPick - steps),
		level: Math.max(spec.level * FATIGUE_LEVEL_FLOOR, spec.level * FATIGUE_LEVEL_FALLOFF ** steps),
	}
}

/** One concrete thing to play: a stack depth plus a set of color layers. */
export interface MusicArrangement {
	/** Raises the first `intensity` layers of `MUSIC_STACK`. */
	intensity: number
	color: readonly MusicColorId[]
	/** Gain for every raised layer. */
	level: number
}

/**
 * Every subset of `items` up to `maxK` in size, including the empty one, in a
 * stable order.
 *
 * Up-to rather than exactly-k matters: it makes "the stack on its own, no color"
 * a legal arrangement, which both widens the cycle and gives fatigue somewhere
 * to land. Every subset is safe to play because color layers are, by definition,
 * the ones the pack declares independent.
 */
function subsetsUpTo<T>(items: readonly T[], maxK: number): T[][] {
	const limit = Math.max(0, Math.min(maxK, items.length))
	const out: T[][] = [[]]
	const acc: T[] = []
	const walk = (start: number): void => {
		if (acc.length === limit) return
		for (let i = start; i < items.length; i++) {
			acc.push(items[i])
			out.push([...acc])
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
 * Every distinct arrangement a (possibly fatigued) mood permits, in a
 * seed-shuffled order.
 *
 * Because the cycle holds only distinct arrangements, indexing it with
 * consecutive variation numbers can never repeat an arrangement back to back —
 * including across the wrap. That is the whole point: exact repetition is what
 * the ear latches onto, so the cycle structurally rules it out and every
 * arrangement gets aired before any of them comes round again.
 */
export function variationCycle(mood: MusicMood, dwell: number, seed: number): MusicArrangement[] {
	const spec = fatigued(mood, dwell)
	const colorSets = subsetsUpTo(spec.color, spec.colorPick)
	const out: MusicArrangement[] = []
	for (let intensity = spec.minIntensity; intensity <= spec.maxIntensity; intensity++) {
		for (const color of colorSets) out.push({ intensity, color, level: spec.level })
	}
	if (out.length === 0) out.push({ intensity: spec.minIntensity, color: [], level: spec.level })
	return shuffled(out, mulberry32(hash32(`${mood}:${seed}`)))
}

/**
 * The arrangement for a given point in a mood. `variation` advances on its own
 * clock (see `musicClock`), `dwell` counts phrases spent in this mood.
 */
export function arrangementFor(
	mood: MusicMood,
	variation: number,
	dwell: number,
	seed: number
): MusicArrangement {
	const cycle = variationCycle(mood, dwell, seed)
	const index = ((Math.trunc(variation) % cycle.length) + cycle.length) % cycle.length
	return cycle[index]
}

/** Expand an arrangement into per-layer gains for the engine. */
export function mixForArrangement(arrangement: MusicArrangement): MusicMix {
	const mix: Record<string, number> = {}
	const depth = Math.max(0, Math.min(MUSIC_STACK.length, Math.trunc(arrangement.intensity)))
	const level = Math.max(0, Math.min(1, arrangement.level))
	if (level === 0) return {}
	for (let i = 0; i < depth; i++) mix[layerTrackId(MUSIC_STACK[i])] = level
	for (const layer of arrangement.color) mix[layerTrackId(layer)] = level
	return mix
}

/** Convenience: mood + clock position → per-layer gains. */
export function mixForMood(
	mood: MusicMood,
	variation: number,
	dwell: number,
	seed: number
): MusicMix {
	return mixForArrangement(arrangementFor(mood, variation, dwell, seed))
}
