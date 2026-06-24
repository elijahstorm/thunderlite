import { unitData } from '$lib/GameData/unit'
import { terrainData } from '$lib/GameData/terrain'
import { generateAttackList } from './Interactor/Pathing/attack'
import { canAttackTarget, hasModifier, isRanged } from './modifiers/canAttack'
import { computeDamageMultiplier, type AttackRole } from './modifiers/damageMultipliers'
import { tileHeightTier } from './modifiers/height'

export type { AttackRole }

export type CombatContext = {
	map: Pick<MapObject, 'layers'>
	defenderTile: number
	/** Tile the attacker fires from. Enables the high-ground damage bonus; when
	 * omitted (callers that don't track it) the bonus is simply skipped. */
	attackerTile?: number
	role?: AttackRole
}

// High ground is an OFFENSE bonus only: firing downhill adds 8% damage per height
// tier of advantage, capped at +16% (~2 tiers). Firing uphill or on the level adds
// nothing — terrain `protection` already rewards the defender on raised ground, so
// an uphill penalty here would double-count and make Mountains/Hills oppressive.
const HIGH_GROUND_PER_TIER = 0.08
const HIGH_GROUND_CAP = 0.16

const highGroundBonus = (
	map: Pick<MapObject, 'layers'>,
	attackerTile: number,
	defenderTile: number
): number => {
	const advantage = tileHeightTier(map, attackerTile) - tileHeightTier(map, defenderTile)
	if (advantage <= 0) return 1
	return 1 + Math.min(advantage * HIGH_GROUND_PER_TIER, HIGH_GROUND_CAP)
}

const computeDamage = (attacker: UnitObject, defender: UnitObject, ctx: CombatContext): number => {
	const attackerStats = unitData[attacker.type]
	const defenderStats = unitData[defender.type]
	if (!attackerStats || !defenderStats) return 0

	const attackerMaxHealth = attackerStats.health
	const attackerCurrentHealth = attacker.health ?? attackerMaxHealth
	const hpRatio = attackerMaxHealth > 0 ? attackerCurrentHealth / attackerMaxHealth : 0

	const baseDamage = attackerStats.power * hpRatio
	const matchupBonus = attackerStats.weaponType === defenderStats.armorType ? 1.5 : 1.0

	const ground = ctx.map.layers.ground[ctx.defenderTile]
	const protection = ground ? (terrainData[ground.type]?.protection ?? 0) : 0
	const terrainGuard = 1 - protection

	const modMultiplier = computeDamageMultiplier({
		attacker,
		defender,
		role: ctx.role ?? 'attack',
	})

	const highGround =
		ctx.attackerTile != null
			? highGroundBonus(ctx.map, ctx.attackerTile, ctx.defenderTile)
			: 1

	const final = Math.round(baseDamage * matchupBonus * terrainGuard * modMultiplier * highGround)
	return final > 0 ? final : 0
}

export const calculateDamage = (
	attacker: UnitObject,
	defender: UnitObject,
	ctx: CombatContext
): number => computeDamage(attacker, defender, ctx)

export const previewDamage = (
	attacker: UnitObject,
	defender: UnitObject,
	ctx: CombatContext
): number => computeDamage(attacker, defender, ctx)

export type CounterAttackContext = {
	map: MapObject
	attackerTile: number
	defenderTile: number
}

export const canCounterAttack = (
	attacker: UnitObject,
	defender: UnitObject,
	ctx: CounterAttackContext
): boolean => {
	const defenderStats = unitData[defender.type]
	if (!defenderStats) return false

	const defenderHealth = defender.health
	if (typeof defenderHealth === 'number' && defenderHealth <= 0) return false

	if (defenderStats.power === 0) return false

	if (hasModifier(attacker, 'Attack.Stun')) return false

	if (!canAttackTarget(defender, attacker)) return false

	if (isRanged(defender) && !hasModifier(defender, 'Can_Attack.Counter_Range')) return false

	const attackList = generateAttackList(ctx.map, ctx.defenderTile, defender)
	if (!attackList.includes(ctx.attackerTile)) return false

	return true
}
