import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { tileHasModifier } from '$lib/Engine/modifiers/terrainModifier'
import { extraRangeBonus } from '$lib/Engine/modifiers/extraSight'
import { indirectFireBlocked } from '$lib/Engine/lineOfSight'
import { viewerVisibility } from '$lib/Engine/fogState'
import { unitSeenByViewer } from '$lib/Engine/visibility'
import { previewDamage } from '$lib/Engine/combat'
import { canAttackTarget } from '$lib/Engine/modifiers/canAttack'
import { generateMovementList } from './movement'

// Adds every in-bounds tile whose Manhattan distance from `center` falls within
// [min, max] to `out` — the geometric reach of a weapon fired from `center`.
// When `indirect` is set (the firer is a long-range attacker), tiles it can't
// actually shell are skipped so they don't show as threatened: Trench tiles such
// as Canyons, and tiles behind a Rampart (Bulwark) between them and `center`. Mirrors
// `canTarget` in Pathing/attack.ts.
const addAttackDiamond = (
	map: MapObject,
	center: number,
	min: number,
	max: number,
	out: Set<number>,
	indirect: boolean,
	// The prospective target's domain. Trench and firing-shadow shelter only
	// SURFACE targets — an air unit hovers above the canyon lip / ridge line in
	// plain view — so those exclusions are skipped when aiming at 'air'. 'any'
	// (the generic overlay union, no specific target) keeps the surface default.
	targetDomain: 'any' | 'ground' | 'air' | 'sea' = 'any'
) => {
	const geometryShelters = targetDomain !== 'air'
	const blocks = indirect && geometryShelters
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
			if (indirect && geometryShelters && tileHasModifier(map, target, 'Trench')) continue
			if (blocks && indirectFireBlocked(map, center, target)) continue
			out.add(target)
		}
	}
}

// Every tile the unit on `tile` could strike on its next turn. Direct units
// (min range 1) may move before firing, so their reach is the union of attack
// diamonds from every tile they can reach. Indirect units can't move-and-fire,
// so their reach is the diamond from where they already stand. Units that deal
// no damage (transports, jammers, …) threaten nothing. `targetDomain` narrows the
// reach to a specific prospective victim: pass 'air' when asking "can this reach
// my aircraft?" so Trench/ridge shelter (surface-only) isn't wrongly subtracted.
export const unitThreatTiles = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	targetDomain: 'any' | 'ground' | 'air' | 'sea' = 'any'
): Set<number> => {
	const out = new Set<number>()
	const stats = unitData[unit.type]
	if (!stats || stats.power <= 0) return out

	const [min, max] = stats.range
	if (min > 1) {
		// Indirect / long-range: can't move-and-fire, and can't reach Trench tiles.
		// High ground extends its reach by one tile (mirrors generateAttackList).
		addAttackDiamond(
			map,
			tile,
			min,
			max + extraRangeBonus(map, tile, unit),
			out,
			true,
			targetDomain
		)
	} else {
		// Direct: closes to point-blank, so move first then strike — Trenches included.
		for (const from of generateMovementList(map, tile, unit)) {
			addAttackDiamond(map, from, min, max, out, false, targetDomain)
		}
	}
	return out
}

// Every tile the unit on `tile` could strike WITHOUT moving first: the attack
// diamond from where it already stands (high ground included for indirect fire).
// This is the "who can shoot a unit parked here from where they are now" question
// the CPU's cheap threat term asks; `unitThreatTiles` above is the move-aware
// superset. Pure geometry — it doesn't care whether a target is on the tile yet,
// which is the whole point: the planner asks about tiles it is *considering*.
export const stationaryThreatTiles = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	targetDomain: 'any' | 'ground' | 'air' | 'sea' = 'any'
): Set<number> => {
	const out = new Set<number>()
	const stats = unitData[unit.type]
	if (!stats || stats.power <= 0) return out
	const [min, max] = stats.range
	addAttackDiamond(
		map,
		tile,
		min,
		max + extraRangeBonus(map, tile, unit),
		out,
		min > 1,
		targetDomain
	)
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
		// Per-unit fog check: an air enemy above canopy/ridge fog is still seen.
		if (!unitSeenByViewer(fog, i, enemy)) continue
		for (const t of unitThreatTiles(map, i, enemy)) out.add(t)
	}
	return out
}

// Like computeThreatTiles, but quantifies the danger: instead of bare membership
// it returns the total incoming HP `unit` would suffer on each tile it could be
// struck on. Damage is summed across every enemy that can reach a tile — focus
// fire is what actually kills you — with each shot forecast from that enemy's
// current tile (a cheap, slightly optimistic stand-in for wherever it would move
// to fire). This feeds the move-advice badge so it scales from a light chip to a
// lethal trap instead of flagging every reachable-by-anything tile identically.
export const computeThreatSeverity = (map: MapObject, unit: UnitObject): Map<number, number> => {
	const out = new Map<number, number>()
	const fog = get(viewerVisibility)
	const units = map.layers.units
	for (let i = 0; i < units.length; i++) {
		const enemy = units[i]
		if (!enemy || enemy.team === unit.team) continue
		// Per-unit fog check: an air enemy above canopy/ridge fog is still seen.
		if (!unitSeenByViewer(fog, i, enemy)) continue
		// An enemy that can't legally target this unit's class (a ground-only gun
		// vs an aircraft, a land unit vs a ship) poses it no danger: its reach must
		// not spill onto this unit's move advice. previewDamage alone won't catch
		// this — it prices the hit without asking whether the shot is allowed.
		if (!canAttackTarget(enemy, unit)) continue
		for (const t of unitThreatTiles(map, i, enemy, unitData[unit.type]?.type ?? 'any')) {
			const dmg = previewDamage(enemy, unit, {
				map,
				defenderTile: t,
				attackerTile: i,
				role: 'attack',
			})
			if (dmg <= 0) continue
			out.set(t, (out.get(t) ?? 0) + dmg)
		}
	}
	return out
}
