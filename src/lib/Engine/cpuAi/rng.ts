/**
 * Deterministic randomness for CPU decisions.
 *
 * The planner is strict argmax everywhere, which makes it exploitable: the same board
 * always produces the same move, so a player who learns one line can replay it, and two
 * CPUs on a mirrored map open move-for-move identically. This lets a decision sample
 * from the plans that were nearly as good as the best one instead of always taking the
 * maximum, so the CPU stays strong but stops being a lookup table.
 *
 * It is deliberately NOT `Math.random`:
 *
 *  - The seed defaults to 0, so with no salt set every decision is reproducible. That is
 *    what keeps the CPU unit tests and the sim harness (`cpuAiSim.unit.test.ts`) stable
 *    — they never set a salt, so they see one fixed, repeatable CPU.
 *  - A real match installs the salt once at start through `Engine/matchSeed`, which owns
 *    where a match's seed comes from (the room row online, a campaign save on resume, a
 *    fresh roll otherwise) and drives every other seeded system off the same number.
 *    Within a match the stream is a pure function of (salt, turn, team, tile), so a
 *    driver client that reloads mid-turn replans to the same choice rather than
 *    diverging from what it already relayed.
 *
 * `cpuRandom` draws *un-namespaced* on purpose, unlike the named streams in
 * `matchSeed.ts`: the planner was here first and its whole regression suite is pinned to
 * this exact sequence. New seeded systems take a stream name instead.
 *
 * Multiplayer safety: only the designated driver client runs CPU seats and relays their
 * actions (`isAiDriver`); every other client applies the relayed action and replays walk
 * the logged action list. No second machine ever recomputes a CPU decision, so this
 * never has to agree across clients.
 */

let salt = 0

/** FNV-1a over a string, for turning a session id into a numeric salt. */
const hashString = (value: string): number => {
	let h = 0x811c9dc5
	for (let i = 0; i < value.length; i++) {
		h ^= value.charCodeAt(i)
		h = Math.imul(h, 0x01000193)
	}
	return h >>> 0
}

/**
 * Set the per-match salt. Call once when a match starts. Passing an empty string or
 * omitting the call leaves the salt at 0, which is the reproducible default the tests
 * rely on.
 */
export const setCpuSeed = (seed: string | number): void => {
	salt = typeof seed === 'number' ? seed >>> 0 : seed ? hashString(seed) : 0
}

/** mulberry32 — small, fast, good enough for tie-breaking. */
const mulberry32 = (seed: number): number => {
	let a = (seed + 0x6d2b79f5) | 0
	let t = Math.imul(a ^ (a >>> 15), 1 | a)
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
	a = t
	return ((a ^ (a >>> 14)) >>> 0) / 4294967296
}

/**
 * One sample in [0, 1), keyed by the match salt and whatever coordinates the caller
 * passes (turn number, team, tile, …). Stateless on purpose: the same coordinates
 * always give the same number, so re-planning the same decision is stable.
 */
export const cpuRandom = (...parts: number[]): number => {
	let h = salt >>> 0
	for (const part of parts) {
		h ^= ((part | 0) + 0x9e3779b9 + (h << 6) + (h >>> 2)) >>> 0
		h >>>= 0
	}
	return mulberry32(h)
}

/**
 * Choose from `items` by score, sampling among those within `temperature` of the best
 * with a softmax weight, rather than always taking the maximum.
 *
 * `temperature` is in the same units as the scores, and acts as a hard band as well as
 * the softmax scale: anything more than `temperature` below the best is never chosen.
 * That is the property that keeps this safe — the CPU never picks a move it rates as
 * clearly worse, it only stops being predictable between options it rates as close. A
 * temperature of 0 (or a single candidate) collapses back to plain argmax.
 *
 * `key` seeds the draw; pass coordinates that identify this decision.
 */
export const sampleByScore = <T extends { score: number }>(
	items: readonly T[],
	temperature: number,
	...key: number[]
): T | null => {
	if (items.length === 0) return null

	let best = items[0]
	for (const item of items) if (item.score > best.score) best = item
	if (!(temperature > 0) || items.length === 1) return best

	const cutoff = best.score - temperature
	const pool: T[] = []
	const weights: number[] = []
	let total = 0
	for (const item of items) {
		if (item.score < cutoff) continue
		// Relative to the best, so the exponent is always <= 0 and can't overflow.
		const weight = Math.exp((item.score - best.score) / temperature)
		pool.push(item)
		weights.push(weight)
		total += weight
	}
	if (pool.length <= 1 || !(total > 0)) return best

	let roll = cpuRandom(...key) * total
	for (let i = 0; i < pool.length; i++) {
		roll -= weights[i]
		if (roll <= 0) return pool[i]
	}
	return pool[pool.length - 1]
}
