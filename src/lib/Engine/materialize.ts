// Pixel "materialize" flash for script-driven changes — a scripted spawn dropping
// a unit onto the board, or a `setTerrain` reshaping a tile. Without a cue these
// pop into existence between frames; the player misses the moment. This gives
// them a short, punchy pixel-art assemble.
//
// It deliberately shares the fog veil's 3px pixel grid (see fogRender.ts) so it
// reads as the same art language — but everything else is the opposite of fog, so
// the two never get confused:
//   fog        — a dark navy veil that *crumbles inward from its lit edge*, keyed
//                by neighbour visibility, easing slowly toward covered.
//   materialize— *bright energy* pixels that build up out of nothing (a random
//                sparkle for a spawn, a top-down sweep for terrain), pile up until
//                the whole tile is covered, hold for a beat, then clear to reveal
//                the finished tile.
//
// The reveal is the payoff: the underlying change is held back until the tile is
// fully covered (a spawned unit stays hidden; a terrain swap is deferred behind an
// `onReveal` callback), so when the energy clears the new thing is simply *there*.
//
// Like the fog, each (kind, frame) pair is baked once into a 60×60 overlay and
// cached, then blitted with nearest-neighbour scaling so the chunks stay crisp at
// any zoom and line up exactly with the terrain sprites underneath.

import { writable } from 'svelte/store'

const FX_SIZE = 60 // native overlay resolution — matches the sprite tile size
const FX_RES = 20 // dither grid; FX_SIZE / FX_RES = 3px chunks, same as the fog
const STEPS = 10 // frames the assemble is quantised to — one cached overlay each

// A spawn lands snappy; a terrain reshape settles a touch slower. Both were slowed
// ~40% from the first pass so the pixels have room to visibly pile up, and the
// spawn a further ~30% so a unit warping in gets a beat of its own. The spawn also
// carries the longer total: its run includes the fade-out tail (below).
const SPAWN_MS = 1040
const TERRAIN_MS = 784
// A burn scorches in a touch slower than a clean terrain reshape — the fire needs
// a beat to catch and spread across the tile before the char is revealed.
const BURN_MS = 900

// The run has three phases, as fractions of the total:
//   [0, FILL_END]        — the cover fills from nothing to complete.
//   [FILL_END, FADE_START] — it holds solid (the finished flash), and the deferred
//                            change is swapped in under it.
//   [FADE_START, 1]      — the cover fades out, so the finished tile emerges from
//                          the glow instead of snapping in.
const FILL_END = 0.6
const FADE_START = 0.8
const EDGE_BAND = 0.16 // width (in fill-progress) of the bright leading edge
const FLASH_MAX = 0.35 // peak alpha of the surge wash as the tile completes

export type MaterializeKind = 'spawn' | 'terrain' | 'burn'

// Bumped whenever an effect begins so the renderer can kick its repaint pump — the
// board's normal cadence is the coarse 200ms sprite tick, far too slow for this.
// MapRender folds this into the same pump that drives the fog fade.
export const materializeSignal = writable(0)

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

// Cheap integer hash → [0,1). Same mixer the fog noise uses, so the sparkle grain
// matches the fog's grain even though the two drive completely different patterns.
const hash01 = (x: number, y: number): number => {
	let h = (x | 0) * 374761393 + (y | 0) * 668265263
	h = (h ^ (h >>> 13)) * 1274126177
	h = h ^ (h >>> 16)
	return (h >>> 0) / 4294967295
}

type Phase = 'fill' | 'fade'

// Per-cell order, in [0,1): during fill a cell stays empty until the coverage
// fraction passes its threshold; during fade it clears once coverage drops back
// below it. Higher threshold ⇒ arrives later on the way in, leaves earlier on the
// way out.
//   fill/spawn   — pure hash: scattered points blink in first, then fill randomly.
//   fill/terrain — vertical position + jitter: a ragged wavefront sweeps down.
//   fade (both)  — distance from the tile centre + a little jitter: the outer
//                  chunks drop first and the glowing core shrinks inward to a dot
//                  before winking out, regardless of how the tile filled.
const CENTER = FX_RES / 2
const MAX_DIST = Math.hypot(CENTER, CENTER)
const cellThreshold = (kind: MaterializeKind, phase: Phase, gx: number, gy: number): number => {
	if (phase === 'fade') {
		const d = Math.hypot(gx + 0.5 - CENTER, gy + 0.5 - CENTER) / MAX_DIST // 0 centre → 1 corner
		// Seed the jitter off-centre so it doesn't line up with the fill hash.
		return clamp01(d * 0.82 + hash01(gx + 37, gy + 91) * 0.18)
	}
	const noise = hash01(gx, gy)
	// spawn warps in and a burn catches alight both as scattered points that fill
	// in; only a clean terrain reshape sweeps top-down.
	if (kind !== 'terrain') return noise
	return clamp01(((gy + 0.5) / FX_RES) * 0.78 + noise * 0.22)
}

// Cool teal for a spawn (warp-in energy), warm gold for terrain (earth/
// construction). Each has a near-white "hot" tone for the leading edge so the
// wavefront glows as fresh pixels arrive.
const palette = (kind: MaterializeKind) => {
	if (kind === 'spawn') return { body: '56, 189, 248', hot: '224, 242, 254' } // sky-400 / sky-100
	// A burn glows like fire (deep ember body, hot orange leading edge) so the char
	// visibly smoulders in, distinct from the gold of a clean terrain reshape.
	if (kind === 'burn') return { body: '176, 64, 22', hot: '250, 170, 74' }
	return { body: '202, 138, 4', hot: '254, 240, 138' } // terrain: yellow-600 / yellow-200
}

const buildOverlay = (
	kind: MaterializeKind,
	phase: Phase,
	level: number
): HTMLCanvasElement | null => {
	if (typeof document === 'undefined') return null
	const canvas = document.createElement('canvas')
	canvas.width = FX_SIZE
	canvas.height = FX_SIZE
	const ctx = canvas.getContext('2d')
	if (!ctx) return null

	const fill = level / STEPS // 0 = empty, 1 = fully covered
	const cell = FX_SIZE / FX_RES
	const { body, hot } = palette(kind)

	for (let gy = 0; gy < FX_RES; gy++) {
		for (let gx = 0; gx < FX_RES; gx++) {
			const threshold = cellThreshold(kind, phase, gx, gy)
			// Hasn't lit up yet — the tile shows through here; draw nothing.
			if (fill < threshold) continue

			// How long ago this cell lit up. Cells right at the wavefront burn hot
			// white; settled cells behind glow in the kind's colour, dimming a little
			// with age so a fresh front reads against the filled body.
			const age = fill - threshold
			let color: string
			if (age < EDGE_BAND) {
				color = `rgba(${hot}, 0.95)`
			} else {
				const alpha = 0.85 - Math.min(0.15, (age - EDGE_BAND) * 0.4)
				color = `rgba(${body}, ${alpha.toFixed(3)})`
			}
			ctx.fillStyle = color
			const x = Math.floor(gx * cell)
			const y = Math.floor(gy * cell)
			const w = Math.ceil((gx + 1) * cell) - x
			const h = Math.ceil((gy + 1) * cell) - y
			ctx.fillRect(x, y, w, h)
		}
	}

	// Surge wash over the top — ramps in as the tile nears full so the moment it
	// completes reads as an energy flash, punctuating the reveal that follows.
	const flash = clamp01((fill - 0.7) / 0.3) * FLASH_MAX
	if (flash > 0.001) {
		ctx.fillStyle = `rgba(${hot}, ${flash.toFixed(3)})`
		ctx.fillRect(0, 0, FX_SIZE, FX_SIZE)
	}

	return canvas
}

const cache = new Map<number, HTMLCanvasElement | null>()

const kindIndex = (kind: MaterializeKind) => (kind === 'spawn' ? 0 : 1)
const phaseIndex = (phase: Phase) => (phase === 'fill' ? 0 : 1)

const getOverlay = (
	kind: MaterializeKind,
	phase: Phase,
	level: number
): HTMLCanvasElement | null => {
	const key = (kindIndex(kind) * 2 + phaseIndex(phase)) * (STEPS + 1) + level
	if (!cache.has(key)) cache.set(key, buildOverlay(kind, phase, level))
	return cache.get(key) ?? null
}

// ── Per-tile effect state ──────────────────────────────────────────────────────
// A tile carries an active effect for its duration, then it's dropped. Progress
// advances by real elapsed time (like the fog fade) so it looks identical however
// often the board repaints. `onReveal` fires once the cover is complete — the
// caller uses it to swap in the deferred change (a terrain type) while it's hidden.

type Effect = {
	start: number
	dur: number
	kind: MaterializeKind
	onReveal?: () => void
	onDone?: () => void
	revealed: boolean
}
const active = new Map<number, Effect>()

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : 0)

// Advance one effect: fire its reveal callback once the cover is complete (so a
// deferred change swaps in under full cover, before the fade-out tail), then its
// done callback (and prune it) once the run is over. Returns the current progress
// (0..1), or null if it just finished (and was removed).
const step = (tile: number, e: Effect, t: number): number | null => {
	const p = (t - e.start) / e.dur
	if (!e.revealed && p >= FILL_END) {
		e.revealed = true
		e.onReveal?.()
	}
	if (p >= 1) {
		active.delete(tile)
		e.onDone?.()
		return null
	}
	return p
}

export interface MaterializeHooks {
	/** Fires once the tile is fully covered — swap in a deferred change under it. */
	onReveal?: () => void
	/** Fires once the assemble has finished and cleared — the tile is settled. */
	onDone?: () => void
}

// Kick off a materialize on `tile`. Without a real clock (headless/test) there's
// nothing to animate, so fire both hooks straight away and skip the visual — the
// deferred change still lands and any gate held around the effect is released.
export const beginMaterialize = (
	tile: number,
	kind: MaterializeKind,
	hooks: MaterializeHooks = {}
): void => {
	if (typeof performance === 'undefined') {
		hooks.onReveal?.()
		hooks.onDone?.()
		return
	}
	active.set(tile, {
		start: performance.now(),
		dur: kind === 'spawn' ? SPAWN_MS : kind === 'burn' ? BURN_MS : TERRAIN_MS,
		kind,
		onReveal: hooks.onReveal,
		onDone: hooks.onDone,
		revealed: false,
	})
	materializeSignal.update((n) => n + 1)
}

// Current progress (0..1) + kind for a tile mid-materialize, or null if none is
// running. `covered` is true while the cover fully hides the tile (fill + hold),
// false once the fade-out tail begins — the paint loop keeps the spawning unit
// hidden until then, so it's revealed *by* the cover dissolving rather than popping
// in under it. Advances the effect (reveal/prune) as a side effect.
export const observeMaterialize = (
	tile: number
): { progress: number; kind: MaterializeKind; covered: boolean } | null => {
	const e = active.get(tile)
	if (!e) return null
	const p = step(tile, e, nowMs())
	if (p === null) return null
	return { progress: clamp01(p), kind: e.kind, covered: p < FADE_START }
}

// True while any tile is still assembling — drives the render pump so it keeps
// repainting until every effect has finished, then stops. Also the reliable place
// reveal callbacks fire for off-screen tiles the paint loop never visits.
export const materializeBusy = (): boolean => {
	const t = nowMs()
	let busy = false
	for (const [tile, e] of active) {
		if (step(tile, e, t) !== null) busy = true
	}
	return busy
}

// Drop every effect. Called when the board's map data is swapped (dev scene
// switches, resets) so a mid-assemble tile can't leak a flash onto the new map.
// Each effect's `onDone` still fires so anything held for the duration of the
// assemble (e.g. the script gate) is released rather than stranded.
export const clearMaterialize = (): void => {
	const pending = [...active.values()]
	active.clear()
	for (const e of pending) e.onDone?.()
}

// Draws the assemble overlay for one tile at `progress` (0..1). Coverage ramps the
// dither level up over the fill phase (few chunks → full), holds full through the
// middle, then ramps it back down over the tail (full → few → empty) — so the cover
// dissolves the same chunky way it built rather than a flat opacity fade. The tail
// uses a centre-weighted overlay set (see cellThreshold), so the outer chunks clear
// first and the glowing core collapses to a dot before it vanishes. Blitted
// nearest-neighbour so the chunks scale exactly like the 60px terrain sprites.
export const drawMaterialize = (
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	progress: number,
	kind: MaterializeKind
): void => {
	const fading = progress >= FADE_START
	const coverage =
		progress <= FILL_END
			? progress / FILL_END
			: !fading
				? 1
				: 1 - (progress - FADE_START) / (1 - FADE_START)
	const level = Math.round(clamp01(coverage) * STEPS)
	if (level <= 0) return

	const overlay = getOverlay(kind, fading ? 'fade' : 'fill', level)
	if (!overlay) return

	const smoothing = context.imageSmoothingEnabled
	context.imageSmoothingEnabled = false
	context.drawImage(overlay, 0, 0, FX_SIZE, FX_SIZE, 0, 0, width, height)
	context.imageSmoothingEnabled = smoothing
}
