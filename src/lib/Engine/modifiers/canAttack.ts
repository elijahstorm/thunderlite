import { unitData } from '$lib/GameData/unit'
import type { ModifierKey } from './index'

const modifiersOf = (unit: UnitObject): readonly ModifierKey[] =>
	unitData[unit.type]?.modifiers ?? []

export const hasModifier = (unit: UnitObject, mod: ModifierKey): boolean =>
	modifiersOf(unit).includes(mod)

export const isRanged = (unit: UnitObject): boolean => {
	const stats = unitData[unit.type]
	if (!stats) return false
	return stats.range[0] >= 2
}

export const canAttackTarget = (attacker: UnitObject, defender: UnitObject): boolean => {
	const attackerStats = unitData[attacker.type]
	const defenderStats = unitData[defender.type]
	if (!attackerStats || !defenderStats) return false

	// An unarmed unit (Jammer Truck, Transporter, Leviathan) has no shot to take:
	// it shouldn't surface an attack range or attack action. Mirrors the power-0
	// defender check in combat's counterattack gate.
	if (attackerStats.power === 0) return false

	if (defenderStats.type === 'air' && !hasModifier(attacker, 'Can_Attack.Air_Raid')) {
		return false
	}
	if (
		defenderStats.type === 'sea' &&
		attackerStats.type !== 'sea' &&
		!hasModifier(attacker, 'Can_Attack.Bombard')
	) {
		return false
	}
	if (
		defenderStats.type === 'ground' &&
		attackerStats.type === 'sea' &&
		!hasModifier(attacker, 'Can_Attack.Ground_Assult')
	) {
		return false
	}

	return true
}
