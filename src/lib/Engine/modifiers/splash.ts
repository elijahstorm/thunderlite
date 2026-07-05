import { adjacentTiles } from './cloak'
import { canAttackTarget, hasModifier } from './canAttack'

// Splash and other secondary hits land at a fraction of the full blow. Shared by
// the commit (`applyAttack`) and the animator's prediction so a splashed unit's
// health bar eases to exactly the value the commit will write.
export const SPLASH_DAMAGE_SCALE = 0.5

/**
 * The occupied tiles a splash attacker's wash actually catches when it strikes
 * `targetTile`: the target's four neighbours holding a unit the attacker could aim
 * at directly. The wash does NOT discriminate by team — it is area damage, so it
 * scorches friendlies caught in the blast exactly as it does foes (the same
 * indiscriminate rule the Lance shaft already follows). It IS filtered by what the
 * attacker can normally hit: a ground-bound flame passes harmlessly under an air
 * unit whether that flyer is an enemy or an ally. The attacker's own tile is never
 * splashed — a melee splash unit (the Scorcher fires point-blank) sits adjacent to
 * its target but doesn't burn itself. The single source of truth for *which* tiles
 * splash hits, so the commit that deals the damage and the sequence that animates
 * it never disagree. Returns an empty list for a non-splash attacker.
 */
export const splashTargetTiles = (
	map: MapObject | MapProcesser,
	attackerTile: number,
	targetTile: number
): number[] => {
	const attacker = map.layers.units[attackerTile]
	if (!attacker || !hasModifier(attacker, 'Attack.Splash')) return []
	return splashTilesFor(map, attacker, attackerTile, targetTile)
}

/**
 * The core wash geometry: given `attacker` firing from `firingTile` at `targetTile`,
 * the neighbouring tiles its splash catches. Skips the firing tile and the attacker
 * itself (by identity) so a melee splasher never burns its own square, and — for the
 * hover preview, where the attacker still sits on its source tile mid-move — a mover
 * about to vacate isn't shown as its own victim. Does NOT re-check `Attack.Splash`;
 * callers gate on that (the preview shows this only for splash units). Team-blind and
 * filtered only by `canAttackTarget`, matching the indiscriminate commit rule.
 */
export const splashTilesFor = (
	map: MapObject | MapProcesser,
	attacker: UnitObject,
	firingTile: number,
	targetTile: number
): number[] => {
	const tiles: number[] = []
	for (const adj of adjacentTiles(map as MapObject, targetTile)) {
		if (adj === firingTile) continue
		const splashed = map.layers.units[adj]
		if (splashed && splashed !== attacker && canAttackTarget(attacker, splashed)) {
			tiles.push(adj)
		}
	}
	return tiles
}

// The visual flavor of a secondary hit, chosen so the effect on the struck tile
// reads as the weapon that reached it. A splash attacker that also burns (the
// Scorcher's flame wash) throws fire; a purely explosive splash (Breaker shells,
// the Gunship's cannon) throws shrapnel; a lance shaft leaves a kinetic pierce.
export type SecondaryEffectKind = 'flame' | 'shrapnel' | 'pierce'

export const splashEffectFor = (attacker: UnitObject): SecondaryEffectKind =>
	hasModifier(attacker, 'Attack.Burn') ? 'flame' : 'shrapnel'
