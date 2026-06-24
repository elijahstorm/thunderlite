// Organic, pixel-art fog of war.
//
// The engine marks each tile simply visible / not-visible. Filling every hidden
// tile with a flat dark square gives the fog hard, grid-aligned corners that
// fight the pixel-art terrain underneath. Instead we render the fog as a dim
// veil whose *edge* — the border with the lit, seen world — crumbles away in
// chunky dithered pixels, wobbled by low-frequency noise so it never reads as a
// straight line or a square corner. Fog that is surrounded by more fog stays a
// solid veil; only where it meets visibility does it dissolve.
//
// Each distinct neighbour configuration (which of the 8 surrounding tiles are
// visible) yields one 60×60 overlay, generated once and cached, then blitted
// with nearest-neighbour scaling so it scales exactly like the 60px terrain
// sprites and stays crisp at any zoom.

const FOG_SIZE = 60 // native overlay resolution — matches the sprite tile size
const FOG_RES = 20 // dither grid; FOG_SIZE / FOG_RES = 3px chunks of "fog pixel"
const BAND = 7 // feather depth, in grid cells, over which the edge dissolves
const NOISE_AMP = 3.5 // how far (in cells) the boundary wobbles in/out
const BASE_ALPHA = 0.46 // veil darkness in solid interior fog
const MOTTLE = 0.05 // ± alpha variation across the body, for a misty, non-flat veil

// Neighbour bits. Edges first, then diagonals.
export const FOG_N = 1 << 0
export const FOG_E = 1 << 1
export const FOG_S = 1 << 2
export const FOG_W = 1 << 3
export const FOG_NE = 1 << 4
export const FOG_SE = 1 << 5
export const FOG_SW = 1 << 6
export const FOG_NW = 1 << 7

// Builds the 8-bit "which neighbours are visible" mask for a hidden tile. Tiles
// off the edge of the map count as NOT visible, so the veil stays solid against
// the world boundary (where the steel border plate sits) and only crumbles where
// it actually abuts seen ground.
export const computeFogMask = (
	visible: Set<number>,
	row: number,
	col: number,
	rows: number,
	cols: number
): number => {
	const open = (r: number, c: number) =>
		r >= 0 && c >= 0 && r < rows && c < cols && visible.has(r * cols + c)
	let mask = 0
	if (open(row - 1, col)) mask |= FOG_N
	if (open(row, col + 1)) mask |= FOG_E
	if (open(row + 1, col)) mask |= FOG_S
	if (open(row, col - 1)) mask |= FOG_W
	if (open(row - 1, col + 1)) mask |= FOG_NE
	if (open(row + 1, col + 1)) mask |= FOG_SE
	if (open(row + 1, col - 1)) mask |= FOG_SW
	if (open(row - 1, col - 1)) mask |= FOG_NW
	return mask
}

// Ordered-dither threshold matrix (Bayer 4×4), normalised to (0,1). Comparing a
// per-cell coverage against this turns a smooth ramp into a chunky pixel dissolve.
const BAYER = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16))

// Cheap integer hash → [0,1).
const hash2 = (x: number, y: number): number => {
	let h = (x | 0) * 374761393 + (y | 0) * 668265263
	h = (h ^ (h >>> 13)) * 1274126177
	h = h ^ (h >>> 16)
	return (h >>> 0) / 4294967295
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Smoothed value noise — low-frequency blobs, not white-noise speckle, so the
// fog edge bulges into bays and inlets rather than fuzzing uniformly.
const valueNoise = (x: number, y: number): number => {
	const xi = Math.floor(x)
	const yi = Math.floor(y)
	const xf = x - xi
	const yf = y - yi
	const u = xf * xf * (3 - 2 * xf)
	const v = yf * yf * (3 - 2 * yf)
	const top = lerp(hash2(xi, yi), hash2(xi + 1, yi), u)
	const bot = lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u)
	return lerp(top, bot, v)
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

// Transition is rendered as a chunky pixel dissolve quantised to STEPS frames:
// the veil condenses in (or thins out) by gaining/losing dithered chunks rather
// than cross-fading its alpha, which keeps the pixel-art character throughout the
// animation. Each (mask, step) pair is one cached overlay.
const STEPS = 8

const buildFogOverlay = (mask: number, level: number): HTMLCanvasElement | null => {
	if (typeof document === 'undefined') return null
	const canvas = document.createElement('canvas')
	canvas.width = FOG_SIZE
	canvas.height = FOG_SIZE
	const ctx = canvas.getContext('2d')
	if (!ctx) return null

	// 0 = clear, STEPS = fully settled. Scaling the settled coverage by this
	// fraction makes the dither dissolve uniformly thin out toward "visible".
	const frac = level / STEPS
	const cell = FOG_SIZE / FOG_RES
	const open = (bit: number) => (mask & bit) !== 0

	for (let gy = 0; gy < FOG_RES; gy++) {
		for (let gx = 0; gx < FOG_RES; gx++) {
			const px = gx + 0.5
			const py = gy + 0.5

			// Distance (in cells) to the nearest open boundary. Edges erode along a
			// perpendicular; a corner-only opening erodes a quarter-circle. The veil
			// is thickest far from any seen tile and thins as it approaches one.
			let d = Infinity
			if (open(FOG_N)) d = Math.min(d, py)
			if (open(FOG_S)) d = Math.min(d, FOG_RES - py)
			if (open(FOG_W)) d = Math.min(d, px)
			if (open(FOG_E)) d = Math.min(d, FOG_RES - px)
			if (open(FOG_NW)) d = Math.min(d, Math.hypot(px, py))
			if (open(FOG_NE)) d = Math.min(d, Math.hypot(FOG_RES - px, py))
			if (open(FOG_SW)) d = Math.min(d, Math.hypot(px, FOG_RES - py))
			if (open(FOG_SE)) d = Math.min(d, Math.hypot(FOG_RES - px, FOG_RES - py))

			// Wobble the boundary inward by a noise-driven amount so the dissolve
			// line meanders organically instead of running parallel to the edge.
			const edgeNoise = valueNoise(gx / 5, gy / 5)
			const coverage = clamp01((d - edgeNoise * NOISE_AMP) / BAND) * frac

			// Chunky dither: a cell is veiled only if its coverage beats the ordered
			// threshold. Interior (coverage 1) always wins → solid; the band thins out.
			if (coverage <= BAYER[gy & 3][gx & 3]) continue

			// Gentle low-frequency darkness variation across the body so the veil
			// reads as drifting mist rather than a dead flat fill.
			const mottle = valueNoise(gx / 7 + 11.3, gy / 7 + 5.7)
			const alpha = BASE_ALPHA + (mottle - 0.5) * MOTTLE

			// Deep slate-navy rather than pure black — a cooler, more atmospheric
			// shroud that sits more naturally over varied terrain than flat black.
			ctx.fillStyle = `rgba(9, 13, 26, ${alpha.toFixed(3)})`
			const x = Math.floor(gx * cell)
			const y = Math.floor(gy * cell)
			const w = Math.ceil((gx + 1) * cell) - x
			const h = Math.ceil((gy + 1) * cell) - y
			ctx.fillRect(x, y, w, h)
		}
	}

	return canvas
}

const cache = new Map<number, HTMLCanvasElement | null>()

const getFogOverlay = (mask: number, level: number): HTMLCanvasElement | null => {
	const key = mask * (STEPS + 1) + level
	if (!cache.has(key)) cache.set(key, buildFogOverlay(mask, level))
	return cache.get(key) ?? null
}

// ── Per-tile fade state ───────────────────────────────────────────────────────
// Each hidden/revealed tile carries a continuous fog level eased toward its
// target (0 = fully visible, 1 = fully covered). The level advances by real
// elapsed time, so the fade looks identical regardless of how often the board
// repaints — a slow sprite tick or a fast animation-frame pump both land it in
// the same place. A tile seen for the first time snaps straight to its target so
// the board doesn't fade up from black on load.

const TAU = 230 // easing time constant (ms); ~3× this ≈ a ~700ms settle

type TileFog = { current: number; target: number; lastMs: number }
const tileState = new Map<number, TileFog>()

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : 0)

// Eases the tile toward `target` and returns its current fog level (0..1).
// Called once per tile per paint; `target` is 1 for covered tiles, 0 for visible.
export const observeFog = (tile: number, target: number): number => {
	const t = nowMs()
	let s = tileState.get(tile)
	if (!s) {
		s = { current: target, target, lastMs: t }
		tileState.set(tile, s)
		return target
	}
	s.target = target
	const dt = t - s.lastMs
	s.lastMs = t
	if (dt > 0) {
		s.current += (target - s.current) * (1 - Math.exp(-dt / TAU))
		if (Math.abs(target - s.current) < 0.004) s.current = target
	}
	return s.current
}

// True while any tracked tile is still mid-fade — drives the render pump so it
// keeps repainting until everything has settled, then stops.
export const fogBusy = (): boolean => {
	for (const s of tileState.values()) {
		if (Math.abs(s.target - s.current) > 0.01) return true
	}
	return false
}

// ── Per-tile unit-opacity fade ────────────────────────────────────────────────
// Mirrors the tile fog easing, but for the *unit* sprite's alpha rather than the
// terrain veil: a cloaked enemy fades out to 0 (gone) and an owned cloaked unit
// settles at 0.5 so the player can read its state, instead of popping. Keyed by
// tile like the fog state; a freshly-occupied tile snaps to its target so units
// don't fade up on spawn/load. Reuses the same TAU so the cadence matches the veil.
type UnitFade = { current: number; target: number; lastMs: number }
const unitFadeState = new Map<number, UnitFade>()

export const observeUnitFade = (tile: number, target: number): number => {
	const t = nowMs()
	let s = unitFadeState.get(tile)
	if (!s) {
		s = { current: target, target, lastMs: t }
		unitFadeState.set(tile, s)
		return target
	}
	s.target = target
	const dt = t - s.lastMs
	s.lastMs = t
	if (dt > 0) {
		s.current += (target - s.current) * (1 - Math.exp(-dt / TAU))
		if (Math.abs(target - s.current) < 0.004) s.current = target
	}
	return s.current
}

// True while any unit opacity is still easing toward its target.
export const unitFadeBusy = (): boolean => {
	for (const s of unitFadeState.values()) {
		if (Math.abs(s.target - s.current) > 0.01) return true
	}
	return false
}

// Draws the fog veil for one tile at fade level `value` (0..1). `mask` selects the
// crumble pattern from computeFogMask(); `value` selects the dissolve frame.
// Nothing is drawn once the tile has fully cleared.
export const drawFog = (
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	mask: number,
	value: number
): void => {
	const level = Math.round(clamp01(value) * STEPS)
	if (level <= 0) return

	const overlay = getFogOverlay(mask, level)
	if (!overlay) {
		context.fillStyle = `rgba(9, 13, 26, ${(BASE_ALPHA * level) / STEPS})`
		context.fillRect(0, 0, width, height)
		return
	}
	const smoothing = context.imageSmoothingEnabled
	context.imageSmoothingEnabled = false
	context.drawImage(overlay, 0, 0, FOG_SIZE, FOG_SIZE, 0, 0, width, height)
	context.imageSmoothingEnabled = smoothing
}
