import { unitData } from '$lib/GameData/unit'
import { canAttackTarget, isRanged } from '$lib/Engine/modifiers/canAttack'
import { tileHasModifier } from '$lib/Engine/modifiers/terrainModifier'
import { extraRangeBonus } from '$lib/Engine/modifiers/extraSight'
import { concealedEnemyTiles } from '$lib/Engine/visibility'
import { indirectFireBlocked } from '$lib/Engine/lineOfSight'

export const generateAttackList = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	// The set of tiles this unit's team can't perceive. Defaults to computing it,
	// which is an O(map) scan — the CPU planner passes a per-tick-cached set instead
	// (see planningContext) so the same concealment isn't rederived for every one of
	// the hundreds of attack-list queries a single turn makes.
	precomputedConcealed?: ReadonlySet<number>
) => {
	const [start, baseEnd] = unitData[unit.type].range
	// High ground (Hills, Mountain) lets indirect units reach one tile further.
	const end = baseEnd + extraRangeBonus(map, tile, unit)
	const targets = [...new Set(diamond(map, tile, unit, start, end))]

	// A target the team can't perceive shouldn't appear on the attack list — you
	// can't intentionally fire on what you can't see. `concealedEnemyTiles` covers
	// every reason a unit is hidden: fog of war, sky cloak, and stealth units that
	// no friendly is standing next to (the latter applies even with fog off, so a
	// submerged sub / cloaked Stealth Tank can't be targeted until it's revealed).
	// With fog off and no stealth in play the set is empty and every drawn enemy
	// stays fair game.
	const concealed = precomputedConcealed ?? concealedEnemyTiles(map, unit.team)
	if (concealed.size === 0) return targets
	return targets.filter((target) => !concealed.has(target))
}

// Tiles inside an indirect unit's firing range (from `tile`) that a Trench or an
// intervening Rampart puts in shadow, so it can't shell them. Pure geometry — it
// ignores whether an enemy is present — because it drives the firing-shadow overlay,
// which shows the player the dead ground a Rampart/Trench creates. Empty for direct
// attackers, which have no firing arc to block.
export const shadowedAttackTiles = (
	map: MapObject,
	tile: number,
	unit: UnitObject
): number[] => {
	if (!isRanged(unit)) return []
	const [min, baseMax] = unitData[unit.type].range
	const max = baseMax + extraRangeBonus(map, tile, unit)
	const cx = tile % map.cols
	const cy = Math.floor(tile / map.cols)
	const out: number[] = []
	for (let dy = -max; dy <= max; dy++) {
		const y = cy + dy
		if (y < 0 || y >= map.rows) continue
		const spread = max - Math.abs(dy)
		for (let dx = -spread; dx <= spread; dx++) {
			if (Math.abs(dx) + Math.abs(dy) < min) continue
			const x = cx + dx
			if (x < 0 || x >= map.cols) continue
			const target = y * map.cols + x
			if (
				tileHasModifier(map, target, 'Trench') ||
				indirectFireBlocked(map, tile, target)
			)
				out.push(target)
		}
	}
	return out
}

const diamond = (map: MapObject, tile: number, unit: UnitObject, start: number, end: number) => {
	let result: number[] = []

	for (let i = start; i <= end; i++) {
		for (let j = 0; j < i; j++) {
			result = [
				...result,
				...addAttackable(map, tile, findTargetTile(map, tile, 'left', 'down', i, j), unit),
				...addAttackable(map, tile, findTargetTile(map, tile, 'right', 'up', i, j), unit),
				...addAttackable(map, tile, findTargetTile(map, tile, 'down', 'right', i, j), unit),
				...addAttackable(map, tile, findTargetTile(map, tile, 'up', 'left', i, j), unit),
			]
		}
	}

	return result
}

const findTargetTile = (
	map: MapObject,
	tile: number,
	direction1: keyof typeof directionDecision,
	direction2: keyof typeof directionDecision,
	amount1: number,
	amount2: number
) =>
	directionDecision[direction2](
		map,
		directionDecision[direction1](map, tile, amount1 - amount2),
		amount2
	)

const addAttackable = (map: MapObject, from: number, target: number | null, unit: UnitObject) =>
	isAttackable(map, from, target, unit) ? [target as number] : []

const isAttackable = (map: MapObject, from: number, tile: number | null, unit: UnitObject) => {
	if (tile === null) return false
	const target = map.layers.units[tile]
	if (!target) return false
	if (target.team === unit.team) return false
	if (!canTarget(map, from, tile, unit)) return false
	if (!canAttackTarget(unit, target)) return false
	return true
}

// Whether `attacker` firing from `from` can actually draw a bead on whatever sits
// on `tile`, independent of weapon type-matchups (which `canAttackTarget` handles).
const canTarget = (map: MapObject, from: number, tile: number, attacker: UnitObject) => {
	// Terrain geometry only shelters SURFACE units. An air target hovers above the
	// canyon lip / ridge line in plain view of an arcing shell, so neither shadow
	// rule applies to it. (Weather never enters here: cloud cover conceals the air
	// unit flying IN it via `hidden`/`concealedEnemyTiles`, and it neither hides
	// nor guards whatever sits on the ground beneath it.)
	const targetIsAir = unitData[map.layers.units[tile]?.type as number]?.type === 'air'
	if (isRanged(attacker) && !targetIsAir) {
		// A Trench tile (the Canyon) sits below the surrounding line of fire: indirect
		// weapons arc over a unit sheltering there and can't reach it. Direct
		// attackers, which close to point-blank range, still can.
		if (tileHasModifier(map, tile, 'Trench')) return false
		// A Rampart (Bulwark) standing between firer and target stops the shell — the
		// target is sheltered behind the wall. A concrete, visible replacement for the
		// old height-shadow rule; elevation no longer gates fire at all.
		if (indirectFireBlocked(map, from, tile)) return false
	}
	return true
}

const directionDecision = {
	right: (map: MapObject, tile: number | null, amount: number) =>
		tile !== null && (tile % map.cols) + amount < map.cols ? tile + amount : null,
	left: (map: MapObject, tile: number | null, amount: number) =>
		tile !== null && tile % map.cols >= amount ? tile - amount : null,
	up: (map: MapObject, tile: number | null, amount: number) =>
		tile !== null && tile >= map.cols * amount ? tile - map.cols * amount : null,
	down: (map: MapObject, tile: number | null, amount: number) =>
		tile !== null && tile + map.cols * amount < map.cols * map.rows
			? tile + map.cols * amount
			: null,
} as const
