import { unitData } from '$lib/GameData/unit'
import { tilesInRange } from './radar'

const JAMMING_MODIFIER = 'Idle.Jamming'

const hasJammingModifier = (type: number): boolean => {
	const modifiers = unitData[type]?.modifiers
	if (!modifiers) return false
	return (modifiers as readonly string[]).includes(JAMMING_MODIFIER)
}

export const computeJammedTiles = (map: MapObject | MapProcesser, team: number): Set<number> => {
	const jammed = new Set<number>()
	const units = map.layers.units
	for (let tile = 0; tile < units.length; tile++) {
		const u = units[tile]
		if (!u) continue
		if (u.team === team) continue
		if (!hasJammingModifier(u.type)) continue
		const [min, max] = unitData[u.type]?.range ?? [2, 3]
		for (const t of tilesInRange(map, tile, min, max)) {
			jammed.add(t)
		}
	}
	return jammed
}

export const isJammedFor = (map: MapObject | MapProcesser, tile: number, team: number): boolean => {
	const units = map.layers.units
	for (let i = 0; i < units.length; i++) {
		const u = units[i]
		if (!u) continue
		if (u.team === team) continue
		if (!hasJammingModifier(u.type)) continue
		const [min, max] = unitData[u.type]?.range ?? [2, 3]
		const cx = i % map.cols
		const cy = Math.floor(i / map.cols)
		const tx = tile % map.cols
		const ty = Math.floor(tile / map.cols)
		const dist = Math.abs(tx - cx) + Math.abs(ty - cy)
		if (dist >= min && dist <= max) return true
	}
	return false
}
