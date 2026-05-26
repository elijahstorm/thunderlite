import { unitData } from '$lib/GameData/unit'
import { markTileActed } from '$lib/Engine/gameState'
import { hasModifier } from './canAttack'

export const REPAIR_RATIO = 0.25

export type RepairResult =
	| { ok: true; healed: number; newHealth: number }
	| { ok: false; reason: 'no-unit' | 'wrong-team' | 'not-repairable' | 'at-full-health' }

export const canRepair = (unit: UnitObject): boolean => {
	if (!hasModifier(unit, 'Self_Action.Repairable')) return false
	const max = unitData[unit.type]?.health ?? 0
	if (max <= 0) return false
	const current = typeof unit.health === 'number' ? unit.health : max
	return current < max
}

export const repair = (map: MapObject | MapProcesser, tile: number, team: number): RepairResult => {
	const unit = map.layers.units[tile]
	if (!unit) return { ok: false, reason: 'no-unit' }
	if (unit.team !== team) return { ok: false, reason: 'wrong-team' }
	if (!hasModifier(unit, 'Self_Action.Repairable')) {
		return { ok: false, reason: 'not-repairable' }
	}

	const max = unitData[unit.type]?.health ?? 0
	if (max <= 0) return { ok: false, reason: 'not-repairable' }

	const current = typeof unit.health === 'number' ? unit.health : max
	if (current >= max) return { ok: false, reason: 'at-full-health' }

	const healAmount = Math.round(max * REPAIR_RATIO)
	const newHealth = Math.min(current + healAmount, max)
	unit.health = newHealth

	markTileActed(tile)

	return { ok: true, healed: newHealth - current, newHealth }
}
