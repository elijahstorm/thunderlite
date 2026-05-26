import { skyData } from '$lib/GameData/sky'
import { unitData } from '$lib/GameData/unit'
import { hasAdjacentEnemy } from './modifiers/cloak'
import { extraSightBonus } from './modifiers/extraSight'

export const isUnitVisibleTo = (unit: UnitObject, team: number): boolean => {
	if (unit.team === team) return true
	return !unit.hidden
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
	return base + extraSightBonus(map, tile, unit)
}

const addDiamond = (map: VisibilityMap, center: number, radius: number, out: Set<number>): void => {
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
			out.add(y * map.cols + x)
		}
	}
}

export const computeTeamVisibility = (map: VisibilityMap, team: number): Set<number> => {
	const visible = new Set<number>()
	const units = map.layers.units
	for (let tile = 0; tile < units.length; tile++) {
		const unit = units[tile]
		if (!unit || unit.team !== team) continue
		const sight = computeUnitSight(map, tile, unit)
		addDiamond(map, tile, sight, visible)
	}
	return visible
}
