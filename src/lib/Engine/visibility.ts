import { get } from 'svelte/store'
import { skyData } from '$lib/GameData/sky'
import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { hasAdjacentEnemy } from './modifiers/cloak'
import { tilesInRange } from './modifiers/radar'
import { extraSightBonus } from './modifiers/extraSight'
import { hasLineOfSight, type OcclusionMode } from './lineOfSight'
import { occlusionMode } from './occlusionState'
import { fogOfWarEnabled } from './fogState'
import { isSmokeConcealed } from './smokeState'

export const isUnitVisibleTo = (unit: UnitObject, team: number): boolean => {
	if (unit.team === team) return true
	return !unit.hidden
}

// Whether `unit`'s type can conceal itself (Stealth Tank, U-Boat). Stealth units
// behave as if hidden in fog even when fog is off; an observer only sees them once
// one of their own units stands adjacent.
export const isStealthUnit = (unit: UnitObject): boolean =>
	unitData[unit.type]?.stealth === true

// Whether `unit`'s type radiates a radar field (the Jammer Truck). A radar field
// is a *ring* from `range[0]`..`range[1]` tiles out — the same band the Move.Radar
// handler sweeps when the jammer drives — so it does not cover the jammer's own
// tile or its immediate neighbours.
export const hasRadarField = (unit: UnitObject): boolean =>
	unitData[unit.type]?.modifiers?.includes('Move.Radar') ?? false

// Type-level variant of {@link hasRadarField} for callers (production ranking) that
// only have a unit type index, not a placed unit.
export const unitTypeHasRadar = (unitType: number): boolean =>
	unitData[unitType]?.modifiers?.includes('Move.Radar') ?? false

// Whether `tile` sits inside the radar ring of any unit hostile to `team`. Radar
// strips concealment positionally: it's recomputed from live unit positions every
// time `isUnitStealthed` is asked, so a cloaked unit that walks through the ring is
// exposed only for the tiles it actually occupies and re-cloaks the moment it
// leaves — there's no persistent "revealed" flag to clear.
export const isTileInEnemyRadar = (map: VisibilityMap, tile: number, team: number): boolean => {
	const tx = tile % map.cols
	const ty = Math.floor(tile / map.cols)
	const units = map.layers.units
	for (let i = 0; i < units.length; i++) {
		const u = units[i]
		if (!u || u.team === team || !hasRadarField(u)) continue
		const [min, max] = unitData[u.type]?.range ?? [0, 0]
		const dist = Math.abs((i % map.cols) - tx) + Math.abs(Math.floor(i / map.cols) - ty)
		if (dist >= min && dist <= max) return true
	}
	return false
}

// The teams (other than `exceptTeam`) whose jammer radar rings cover `tile`. The
// stealth-memory tracker uses this to credit the right observers when a cloaked unit
// is caught crossing a ring during its move.
export const radarTeamsCovering = (
	map: VisibilityMap,
	tile: number,
	exceptTeam: number
): number[] => {
	const tx = tile % map.cols
	const ty = Math.floor(tile / map.cols)
	const units = map.layers.units
	const out: number[] = []
	for (let i = 0; i < units.length; i++) {
		const u = units[i]
		if (!u || u.team === exceptTeam || !hasRadarField(u)) continue
		const [min, max] = unitData[u.type]?.range ?? [0, 0]
		const dist = Math.abs((i % map.cols) - tx) + Math.abs(Math.floor(i / map.cols) - ty)
		if (dist >= min && dist <= max && !out.includes(u.team)) out.push(u.team)
	}
	return out
}

// The radar rings to paint from `viewerTeam`'s vantage, split for tinting: `own`
// is the viewer's own detection net (always drawn), `enemy` is the ring of any
// hostile jammer the viewer can presently see. A `visible` set (the fog reach, or
// null when fog is off) gates the enemy rings so radar from a jammer hidden in fog
// never leaks onto the board. Jammers aren't stealth units, so fog is the only
// thing that can hide one.
export const computeRadarTiles = (
	map: VisibilityMap,
	viewerTeam: number,
	visible: Set<number> | null
): { own: Set<number>; enemy: Set<number> } => {
	const own = new Set<number>()
	const enemy = new Set<number>()
	const units = map.layers.units
	for (let tile = 0; tile < units.length; tile++) {
		const u = units[tile]
		if (!u || !hasRadarField(u)) continue
		const isOwn = u.team === viewerTeam
		if (!isOwn && visible !== null && !visible.has(tile)) continue
		const [min, max] = unitData[u.type]?.range ?? [0, 0]
		const sink = isOwn ? own : enemy
		for (const ringTile of tilesInRange(map, tile, min, max)) sink.add(ringTile)
	}
	return { own, enemy }
}

// Whether `unit` is currently cloaked — concealed from its enemies regardless of
// who's looking. True when the sky/cloak modifier has flagged it `hidden`, or it's
// a stealth unit nobody has yet pinned down (the "assume always stealthed" rule,
// mirroring End_Turn.Cloak's reveal-when-adjacent) — but an enemy Jammer Truck's
// radar ring overrides all of that and exposes whatever stands in it.
//
// Crucially, an *explicit* flush (`hidden === false`, set when an enemy closes to
// point-blank or radar catches it) sticks until the unit's own End_Turn.Cloak gets a
// chance to re-cloak it. So a unit that broke cover stays trackable as it moves this
// turn — you watched it leave, you can follow it to its destination — instead of
// blinking back into stealth the instant it's no longer adjacent. The fuzzy
// "assume stealthed" fallback therefore only applies while `hidden` is still
// undetermined (undefined), never to override a known reveal.
//
// This is the team-agnostic state the renderer reads to dim an owned cloaked unit and
// to hide an enemy one; `concealedEnemyTiles` folds it together with fog.
export const isUnitStealthed = (map: VisibilityMap, tile: number, unit: UnitObject): boolean =>
	(unit.hidden === true ||
		(unit.hidden !== false && isStealthUnit(unit) && !hasAdjacentEnemy(map, tile, unit.team))) &&
	!isTileInEnemyRadar(map, tile, unit.team)

// Tiles holding an enemy unit that `team` cannot perceive — hidden by fog of war,
// cloaked by sky cover (`unit.hidden`), or a stealth unit no enemy has flushed out
// by closing to point-blank. Movement pathing treats these tiles as empty so a
// player can't deduce a hidden enemy's position from a blocked path; a unit that
// actually walks into one collides and halts (see the interactor's `move`). The
// attack list, the AI, and the renderer all consult it so every system agrees on
// what's perceivable. With fog off and no stealth units on the board this set is
// empty, so ordinary play is unaffected.
export const concealedEnemyTiles = (map: VisibilityMap, team: number): Set<number> => {
	const out = new Set<number>()
	const fog = get(fogOfWarEnabled)
	const visible = fog ? computeTeamVisibility(map, team) : null
	const units = map.layers.units
	for (let tile = 0; tile < units.length; tile++) {
		const unit = units[tile]
		if (!unit || unit.team === team) continue
		if ((visible !== null && !visible.has(tile)) || isUnitStealthed(map, tile, unit)) {
			out.add(tile)
		}
	}
	return out
}

export type VisibilityMap = Pick<MapObject, 'cols' | 'rows' | 'layers'>

// Concealing terrain (Forest) swallows whatever shelters on it. In fog of war the
// tile is perceived only by a viewer standing on or right beside it (Manhattan
// distance <= 1), or by a friendly radar/jammer field sweeping across it — from
// any farther a viewer sees treetops, not the units beneath them. This is the rule
// that makes wooded tiles worth holding rather than just a defense bonus.
export const isConcealingTerrain = (map: VisibilityMap, tile: number): boolean =>
	(terrainData[map.layers.ground[tile]?.type]?.modifiers.includes('Conceals') ?? false) ||
	isSmokeConcealed(tile)

// Friendly radar/jammer rings see into concealing terrain: a forest tile swept by a
// friendly radar field is revealed even with no unit beside it, mirroring how radar
// strips a cloaked unit's concealment. Radar penetrates, so this ignores height
// occlusion.
const addRadarRevealedConcealment = (map: VisibilityMap, team: number, out: Set<number>): void => {
	const units = map.layers.units
	for (let tile = 0; tile < units.length; tile++) {
		const u = units[tile]
		if (!u || u.team !== team || !hasRadarField(u)) continue
		const [min, max] = unitData[u.type]?.range ?? [0, 0]
		for (const ring of tilesInRange(map, tile, min, max)) {
			if (isConcealingTerrain(map, ring)) out.add(ring)
		}
	}
}

export const isAirHiddenBySky = (map: VisibilityMap, tile: number, unit: UnitObject): boolean => {
	if (unitData[unit.type]?.type !== 'air') return false
	const sky = map.layers.sky[tile]
	if (!sky) return false
	return skyData[sky.type]?.modifiers.includes('hidden') ?? false
}

export const applySkyHiding = (map: MapObject | MapProcesser, team: number): void => {
	for (let tile = 0; tile < map.layers.units.length; tile++) {
		const unit = map.layers.units[tile]
		if (!unit) continue
		if (unit.team !== team) continue
		if (!isAirHiddenBySky(map, tile, unit)) continue
		unit.hidden = !hasAdjacentEnemy(map, tile, unit.team)
	}
}

export const computeUnitSight = (map: VisibilityMap, tile: number, unit: UnitObject): number => {
	const base = unitData[unit.type]?.sight ?? 0
	if (base <= 0) return 0
	return base + extraSightBonus(map, tile)
}

// Adds the Manhattan diamond of radius `sight` around `center` to `out`. When an
// occlusion `mode` other than 'off' is supplied, each candidate tile must also have
// an unobstructed line of sight from `center` — terrain height can hide tiles that
// fall within raw range. Airborne viewers (passed mode 'off') ignore occlusion.
const addDiamond = (
	map: VisibilityMap,
	center: number,
	radius: number,
	out: Set<number>,
	mode: OcclusionMode
): void => {
	if (radius < 0) return
	const cx = center % map.cols
	const cy = Math.floor(center / map.cols)
	for (let dy = -radius; dy <= radius; dy++) {
		const remaining = radius - Math.abs(dy)
		const y = cy + dy
		if (y < 0 || y >= map.rows) continue
		for (let dx = -remaining; dx <= remaining; dx++) {
			const x = cx + dx
			if (x < 0 || x >= map.cols) continue
			const tile = y * map.cols + x
			if (mode !== 'off' && !hasLineOfSight(map, center, tile, mode)) continue
			// Forest and other concealing terrain hide their occupants from any viewer
			// not standing on or directly beside the tile (radar reveal is layered on
			// separately, in computeTeamVisibility).
			if (Math.abs(dx) + Math.abs(dy) > 1 && isConcealingTerrain(map, tile)) continue
			out.add(tile)
		}
	}
}

export const computeTeamVisibility = (map: VisibilityMap, team: number): Set<number> => {
	const visible = new Set<number>()
	const mode = get(occlusionMode)
	const units = map.layers.units
	for (let tile = 0; tile < units.length; tile++) {
		const unit = units[tile]
		if (!unit || unit.team !== team) continue
		const sight = computeUnitSight(map, tile, unit)
		// Airborne units look down from above, so terrain never occludes their view.
		const airborne = unitData[unit.type]?.type === 'air'
		addDiamond(map, tile, sight, visible, airborne ? 'off' : mode)
	}
	addRadarRevealedConcealment(map, team, visible)
	return visible
}
