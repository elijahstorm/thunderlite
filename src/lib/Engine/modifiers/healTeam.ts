import { runModifiers, type ModifierContext, type ModifierHandler, type ModifierTarget } from './index'
import { unitData } from '$lib/GameData/unit'
import { resetCaptureProgress } from './capture'

const HEAL_AMOUNT = 10
const HURT_AMOUNT = 10

// Runs at the start of the building owner's turn (Start_Turn). A friendly unit
// sitting on the building is repaired; an enemy unit camping it is damaged
// instead, punishing them for holding the tile mid-capture. If the damage kills
// the occupant we clear it, reset any capture progress, and fire its Death
// modifiers, mirroring the terrain-damage path in turnLoop.
export const healTeam: ModifierHandler = (target: ModifierTarget, ctx: ModifierContext): void => {
	if (ctx.kind !== 'building') return
	if (!ctx.map) return

	const building = target as BuildingObject
	const unit = ctx.map.layers.units[ctx.tile]
	if (!unit) return

	const max = unitData[unit.type]?.health
	if (typeof max !== 'number') return

	const current = typeof unit.health === 'number' ? unit.health : max

	if (unit.team === building.team) {
		if (current >= max) return
		unit.health = Math.min(current + HEAL_AMOUNT, max)
		return
	}

	const next = Math.max(0, current - HURT_AMOUNT)
	unit.health = next
	if (next > 0) return

	ctx.map.layers.units[ctx.tile] = null
	resetCaptureProgress(building, unit.team)
	runModifiers(unit, 'Death', { kind: 'unit', tile: ctx.tile, state: ctx.state, map: ctx.map })
}
