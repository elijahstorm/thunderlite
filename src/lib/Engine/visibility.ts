import { get } from 'svelte/store'
import { skyData } from '$lib/GameData/sky'
import { unitData } from '$lib/GameData/unit'
import { hasAdjacentEnemy } from './modifiers/cloak'
import { extraSightBonus } from './modifiers/extraSight'
import { hasLineOfSight, type OcclusionMode } from './lineOfSight'
import { occlusionMode } from './occlusionState'
import { fogOfWarEnabled } from './fogState'

export const isUnitVisibleTo = (unit: UnitObject, team: number): boolean => {
	if (unit.team === team) return true
	return !unit.hidden
}

// Whether `unit`'s type can conceal itself (Stealth Tank, U-Boat). Stealth units
// behave as if hidden in fog even when fog is off; an observer only sees them once
// one of their own units stands adjacent.
export const isStealthUnit = (unit: UnitObject): boolean =>
	unitData[unit.type]?.stealth === true

// Whether `unit` is currently cloaked — concealed from its enemies regardless of
// who's looking. True when the sky/cloak modifier has flagged it `hidden`, or it's
// a stealth unit no enemy has flushed out by closing to point-blank (the "assume
// always stealthed" rule, mirroring End_Turn.Cloak's reveal-when-adjacent). This is
// the team-agnostic state the renderer reads to dim an owned cloaked unit and to
// hide an enemy one; `concealedEnemyTiles` folds it together with fog.
export const isUnitStealthed = (map: VisibilityMap, tile: number, unit: UnitObject): boolean =>
	unit.hidden === true || (isStealthUnit(unit) && !hasAdjacentEnemy(map, tile, unit.team))

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
	return visible
}
