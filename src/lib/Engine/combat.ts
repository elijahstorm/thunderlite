import { unitData } from '$lib/GameData/unit'
import { terrainData } from '$lib/GameData/terrain'

export type CombatContext = {
	map: Pick<MapObject, 'layers'>
	defenderTile: number
}

const computeDamage = (
	attacker: UnitObject,
	defender: UnitObject,
	ctx: CombatContext
): number => {
	const attackerStats = unitData[attacker.type]
	const defenderStats = unitData[defender.type]
	if (!attackerStats || !defenderStats) return 0

	const attackerMaxHealth = attackerStats.health
	const attackerCurrentHealth = attacker.health ?? attackerMaxHealth
	const hpRatio = attackerMaxHealth > 0 ? attackerCurrentHealth / attackerMaxHealth : 0

	const baseDamage = attackerStats.power * hpRatio
	const matchupBonus = attackerStats.weaponType === defenderStats.armorType ? 1.5 : 1.0

	const ground = ctx.map.layers.ground[ctx.defenderTile]
	const protection = ground ? terrainData[ground.type]?.protection ?? 0 : 0
	const terrainGuard = 1 - protection

	const final = Math.round(baseDamage * matchupBonus * terrainGuard)
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
