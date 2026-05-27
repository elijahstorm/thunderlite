import { unitData } from '$lib/GameData/unit'
import { generateMovementList } from './movement'

// Adds every in-bounds tile whose Manhattan distance from `center` falls within
// [min, max] to `out` — the geometric reach of a weapon fired from `center`.
const addAttackDiamond = (
	map: MapObject,
	center: number,
	min: number,
	max: number,
	out: Set<number>
) => {
	const cx = center % map.cols
	const cy = Math.floor(center / map.cols)
	for (let dy = -max; dy <= max; dy++) {
		const y = cy + dy
		if (y < 0 || y >= map.rows) continue
		const spread = max - Math.abs(dy)
		for (let dx = -spread; dx <= spread; dx++) {
			if (Math.abs(dx) + Math.abs(dy) < min) continue
			const x = cx + dx
			if (x < 0 || x >= map.cols) continue
			out.add(y * map.cols + x)
		}
	}
}

// Every tile the unit on `tile` could strike on its next turn. Direct units
// (min range 1) may move before firing, so their reach is the union of attack
// diamonds from every tile they can reach. Indirect units can't move-and-fire,
// so their reach is the diamond from where they already stand. Units that deal
// no damage (transports, jammers, …) threaten nothing.
export const unitThreatTiles = (map: MapObject, tile: number, unit: UnitObject): Set<number> => {
	const out = new Set<number>()
	const stats = unitData[unit.type]
	if (!stats || stats.power <= 0) return out

	const [min, max] = stats.range
	if (min > 1) {
		addAttackDiamond(map, tile, min, max, out)
	} else {
		for (const from of generateMovementList(map, tile, unit)) {
			addAttackDiamond(map, from, min, max, out)
		}
	}
	return out
}

// Union of every enemy unit's reach — the set of tiles `team` is exposed on.
export const computeThreatTiles = (map: MapObject, team: number): Set<number> => {
	const out = new Set<number>()
	const units = map.layers.units
	for (let i = 0; i < units.length; i++) {
		const enemy = units[i]
		if (!enemy || enemy.team === team) continue
		for (const t of unitThreatTiles(map, i, enemy)) out.add(t)
	}
	return out
}
