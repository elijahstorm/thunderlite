import { tileHeight, tileHeightTier, EYE_HEIGHT } from './modifiers/height'

export type OcclusionMode = 'off' | 'viewer-relative' | 'raycast'

// The tiles the straight segment from `a` to `b` crosses, excluding the two
// endpoints, each tagged with its parametric position `t` in (0, 1) along the
// segment. A grid walk sampled on the dominant axis (Bresenham-like) — accurate
// enough for tile line-of-sight on these small boards, and cheap.
const lineBetween = (
	map: Pick<MapObject, 'cols' | 'rows'>,
	a: number,
	b: number
): { tile: number; t: number }[] => {
	const ax = a % map.cols
	const ay = Math.floor(a / map.cols)
	const bx = b % map.cols
	const by = Math.floor(b / map.cols)
	const dx = bx - ax
	const dy = by - ay
	const steps = Math.max(Math.abs(dx), Math.abs(dy))
	const out: { tile: number; t: number }[] = []
	for (let i = 1; i < steps; i++) {
		const t = i / steps
		const x = Math.round(ax + dx * t)
		const y = Math.round(ay + dy * t)
		const tile = y * map.cols + x
		if (tile === a || tile === b) continue
		if (out.length > 0 && out[out.length - 1].tile === tile) continue
		out.push({ tile, t })
	}
	return out
}

// MODEL A — viewer-relative tiers. A tile blocks the view of anything beyond it
// when its height tier exceeds the viewer's own elevation tier. Standing on high
// ground lets you see over lower obstacles; you can never see past terrain taller
// than where you stand. Coarse but very intuitive.
const clearViewerRelative = (
	map: Pick<MapObject, 'cols' | 'rows' | 'layers'>,
	viewer: number,
	target: number
): boolean => {
	const viewerTier = tileHeightTier(map, viewer)
	for (const { tile } of lineBetween(map, viewer, target)) {
		if (tileHeightTier(map, tile) > viewerTier) return false
	}
	return true
}

// MODEL B — raycast with eye height. Trace the eye-line from the viewer's eye
// (terrain height + EYE_HEIGHT) toward the target's eye height; an intervening
// tile blocks if its raw terrain rises above the interpolated sightline at that
// point. True 2.5D line of sight — a distant ridge can occlude while the same
// ridge seen from higher up does not.
const clearRaycast = (
	map: Pick<MapObject, 'cols' | 'rows' | 'layers'>,
	viewer: number,
	target: number
): boolean => {
	const eye = tileHeight(map, viewer) + EYE_HEIGHT
	const aim = tileHeight(map, target) + EYE_HEIGHT
	for (const { tile, t } of lineBetween(map, viewer, target)) {
		const sightline = eye + (aim - eye) * t
		if (tileHeight(map, tile) > sightline) return false
	}
	return true
}

export const hasLineOfSight = (
	map: Pick<MapObject, 'cols' | 'rows' | 'layers'>,
	viewer: number,
	target: number,
	mode: OcclusionMode
): boolean => {
	if (mode === 'off') return true
	if (mode === 'raycast') return clearRaycast(map, viewer, target)
	return clearViewerRelative(map, viewer, target)
}

// Indirect-fire shadow (idea #4): a long-range shell can't reach a target that
// sits in the shadow of higher ground between it and the firer — you can't drop
// rounds onto a unit tucked behind a ridge, or down into a trench. Expressed in
// tiers: the target is shadowed when some intervening tile is taller than the
// TARGET tile (so a mountaintop is always hittable, a canyon floor rarely is).
// This generalises the hand-coded Canyon `Trench` rule to all terrain height.
export const indirectFireShadowed = (
	map: Pick<MapObject, 'cols' | 'rows' | 'layers'>,
	from: number,
	target: number
): boolean => {
	const targetTier = tileHeightTier(map, target)
	for (const { tile } of lineBetween(map, from, target)) {
		if (tileHeightTier(map, tile) > targetTier) return true
	}
	return false
}
