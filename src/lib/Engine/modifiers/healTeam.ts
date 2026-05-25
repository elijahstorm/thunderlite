import type { ModifierContext, ModifierHandler, ModifierTarget } from './index'
import { unitData } from '$lib/GameData/unit'

const HEAL_AMOUNT = 10

export const healTeam: ModifierHandler = (target: ModifierTarget, ctx: ModifierContext): void => {
	if (ctx.kind !== 'building') return
	if (!ctx.map) return

	const building = target as BuildingObject
	const unit = ctx.map.layers.units[ctx.tile]
	if (!unit) return
	if (unit.team !== building.team) return

	const max = unitData[unit.type]?.health
	if (typeof max !== 'number') return

	const current = typeof unit.health === 'number' ? unit.health : max
	if (current >= max) return

	unit.health = Math.min(current + HEAL_AMOUNT, max)
}
