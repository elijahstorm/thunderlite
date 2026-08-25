/**
 * Registry of adaptive music packs.
 *
 * A pack is one composition delivered as several INDEPENDENT stems: same length,
 * same tempo, same key, mixed by the composer to sum cleanly in any combination.
 * That independence is measured, not assumed — subtracting one Blips layer from
 * another yields exactly the same energy as summing them, which only happens
 * when the two signals are uncorrelated. So any subset of a pack's layers is a
 * legal thing to play, and the variation machinery is free to pick freely.
 *
 * Layers WITHIN a pack are interchangeable. Layers ACROSS packs are not: the
 * three packs here run at different tempos (their loop lengths differ) and
 * almost certainly different keys, so mixing two packs would clash and
 * crossfading between them mid-match would be worse. A match therefore picks one
 * pack and holds it. Variety across packs is variety across *matches*, which is
 * the axis that actually matters — nobody notices the pack they are not hearing,
 * but everybody notices the one they have heard forty times.
 *
 * `phrasesPerLoop` divides the loop into musical subdivisions. Deriving the
 * phrase length from the loop rather than hard-coding seconds guarantees a
 * phrase edge lands exactly on the loop point, so re-arrangements stay on the
 * grid however many times the bed wraps.
 */

export interface MusicPack {
	id: string
	/** Loop length in seconds. Every layer in the pack shares it exactly. */
	loopSeconds: number
	/**
	 * Musical subdivisions per loop. Chosen so `phraseSecondsFor` lands near 14s,
	 * long enough that re-arrangements do not feel twitchy and short enough that
	 * a turn does not pass without one.
	 */
	phrasesPerLoop: number
	/**
	 * The layer that carries the piece on its own. Raised in every mood except
	 * `silent`, so there is always something holding the harmony together.
	 */
	foundation: string
	/** Freely combinable layers. Any subset sums cleanly against the foundation. */
	extras: readonly string[]
	/** Kept out of the match rotation (scaffolding, not a soundtrack). */
	devOnly?: boolean
	/** Where the pack came from, for the credits screen. */
	credit?: string
}

const BLIPS = 'Blips.fm'

/**
 * Ordered by loop length. Blips ships every pack with the same generic
 * `Track_1_Layer_N` filenames, so the ids here are positional; rename both the
 * id and its directory under `static/game/sounds/music/packs/` once each one has
 * a title worth showing a player.
 */
export const MUSIC_PACKS: readonly MusicPack[] = [
	{
		id: 'pack1',
		loopSeconds: 60.0,
		phrasesPerLoop: 4, // 15.00s phrases
		foundation: 'packs/pack1/layer1',
		extras: ['packs/pack1/layer2', 'packs/pack1/layer3'],
		credit: BLIPS,
	},
	{
		id: 'pack2',
		loopSeconds: 66.98,
		phrasesPerLoop: 5, // 13.40s phrases
		foundation: 'packs/pack2/layer1',
		extras: ['packs/pack2/layer2', 'packs/pack2/layer3'],
		credit: BLIPS,
	},
	{
		id: 'pack3',
		loopSeconds: 69.57,
		phrasesPerLoop: 5, // 13.91s phrases
		foundation: 'packs/pack3/layer1',
		extras: ['packs/pack3/layer2', 'packs/pack3/layer3'],
		credit: BLIPS,
	},
	{
		// Band-split scaffolding from scripts/audio/gen-demo-layers.sh. Disjoint
		// frequency bands are genuinely independent, so it behaves like a real pack
		// — it just is not music anybody wrote. Dev-only, and absent unless the
		// generator has been run.
		id: 'demo',
		loopSeconds: 96,
		phrasesPerLoop: 6, // 16.00s phrases
		foundation: 'packs/demo/bed',
		extras: [
			'packs/demo/pulse',
			'packs/demo/bass',
			'packs/demo/melody',
			'packs/demo/accent',
			'packs/demo/texture',
		],
		devOnly: true,
		credit: 'derived from an existing ThunderLite track',
	},
]

/** Packs eligible for a real match. */
export const PLAYABLE_PACKS: readonly MusicPack[] = MUSIC_PACKS.filter((p) => !p.devOnly)

/** Every manifest id a pack needs loaded, foundation first. */
export function packLayers(pack: MusicPack): readonly string[] {
	return [pack.foundation, ...pack.extras]
}

/** Seconds of audio per phrase. Always divides the loop exactly. */
export function phraseSecondsFor(pack: MusicPack): number {
	return pack.loopSeconds / Math.max(1, pack.phrasesPerLoop)
}

/**
 * Seconds per phrase given the loop length the bed actually decoded. A pack's
 * `loopSeconds` is a rounded figure and the encoded assets run a few tens of
 * milliseconds shorter than it (more so on mp3 than ogg), so a phrase length
 * derived from the registry slowly walks off the loop point over a long match.
 * Prefer this wherever the real length is known; it falls back to the registry
 * before anything has decoded.
 */
export function phraseSecondsForLoop(
	pack: MusicPack,
	loopSeconds: number | null | undefined
): number {
	if (typeof loopSeconds !== 'number' || !(loopSeconds > 0)) return phraseSecondsFor(pack)
	return loopSeconds / Math.max(1, pack.phrasesPerLoop)
}

/** Look a pack up by id, across dev-only ones too. */
export function packById(id: string): MusicPack | undefined {
	return MUSIC_PACKS.find((p) => p.id === id)
}

/**
 * Pick the pack for a match. Deterministic in the seed, so a replay hears the
 * same pack the live match did, and consecutive matches on different seeds
 * spread across the catalogue.
 */
export function packForMatch(seed: number): MusicPack {
	const pool = PLAYABLE_PACKS.length > 0 ? PLAYABLE_PACKS : MUSIC_PACKS
	const index = ((Math.trunc(seed) % pool.length) + pool.length) % pool.length
	return pool[index]
}
