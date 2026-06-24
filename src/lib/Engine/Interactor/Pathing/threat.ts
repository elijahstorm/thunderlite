import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { tileHasModifier } from '$lib/Engine/modifiers/terrainModifier'
import { extraRangeBonus } from '$lib/Engine/modifiers/extraSight'
import { indirectFireShadowed } from '$lib/Engine/lineOfSight'
import { indirectShadowsEnabled } from '$lib/Engine/occlusionState'
import { viewerVisibility } from '$lib/Engine/fogState'
import { generateMovementList } from './movement'

// Adds every in-bounds tile whose Manhattan distance from `center` falls within
// [min, max] to `out` — the geometric reach of a weapon fired from `center`.
// When `indirect` is set (the firer is a long-range attacker), tiles it can't
// actually shell are skipped so they don't show as threatened: Trench tiles such
// as Canyons, and tiles shadowed by higher ground between them and `center`. Mirrors
// `canTarget` in Pathing/attack.ts.
const addAttackDiamond = (
	map: MapObject,
	center: number,
	min: number,
	max: number,
	out: Set<number>,
	indirect: boolean
) => {
	const shadows = indirect && get(indirectShadowsEnabled)
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
			const target = y * map.cols + x
			if (indirect && tileHasModifier(map, target, 'Trench')) continue
			if (shadows && indirectFireShadowed(map, center, target)) continue
			out.add(target)
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
		// Indirect / long-range: can't move-and-fire, and can't reach Trench tiles.
		// High ground extends its reach by one tile (mirrors generateAttackList).
		addAttackDiamond(map, tile, min, max + extraRangeBonus(map, tile, unit), out, true)
	} else {
		// Direct: closes to point-blank, so move first then strike — Trenches included.
		for (const from of generateMovementList(map, tile, unit)) {
			addAttackDiamond(map, from, min, max, out, false)
		}
	}
	return out
}

// Union of every enemy unit's reach — the set of tiles `team` is exposed on.
// Enemies hidden in the local viewer's fog are skipped: their threat must not
// leak onto the move-advice overlay and reveal a position the player can't see.
// With fog off, `viewerVisibility` is null and every off-team unit counts.
export const computeThreatTiles = (map: MapObject, team: number): Set<number> => {
	const out = new Set<number>()
	const fog = get(viewerVisibility)
	const units = map.layers.units
	for (let i = 0; i < units.length; i++) {
		const enemy = units[i]
		if (!enemy || enemy.team === team) continue
		if (fog && !fog.visible.has(i)) continue
		for (const t of unitThreatTiles(map, i, enemy)) out.add(t)
	}
	return out
}
