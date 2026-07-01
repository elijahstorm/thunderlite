import {
	runModifiers,
	type ModifierContext,
	type ModifierHandler,
	type ModifierTarget,
} from './index'
import { captureMaxStature, captureReduction } from './capture'

export const capture: ModifierHandler = (target: ModifierTarget, ctx: ModifierContext): void => {
	if (ctx.kind !== 'unit') return
	if (!ctx.map) return

	const unit = target as UnitObject

	// Capture now happens automatically at the start of the owner's turn (this is a
	// Start_Turn modifier, dispatched by turnLoop) rather than via a menu action. A
	// unit that *attacked* last turn forfeits this turn's capture tick — `attacked`
	// is set when it fires (see applyAttack) and consumed here. We clear it for every
	// capture-capable unit, on a building or not, so it never goes stale.
	const attackedLastTurn = unit.attacked === true
	if (unit.attacked) delete unit.attacked

	const building = ctx.map.layers.buildings[ctx.tile]
	if (!building) return
	if (building.team === unit.team) return
	if (attackedLastTurn) return

	const max = captureMaxStature(building.type)
	if (max <= 0) return

	const current = typeof building.stature === 'number' ? building.stature : max
	const reduction = captureReduction(unit)
	if (reduction <= 0) return

	const next = current - reduction

	if (next > 0) {
		building.stature = next
		return
	}

	const previousTeam = building.team
	building.team = unit.team
	building.stature = max

	runModifiers(building, 'Capture', {
		kind: 'building',
		tile: ctx.tile,
		state: ctx.state,
		map: ctx.map,
		previousTeam,
	})
}
