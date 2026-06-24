import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import {
	runModifiers,
	type ModifierContext,
	type ModifierHandler,
	type ModifierTarget,
} from './index'

export const captureMaxStature = (buildingType: number): number =>
	buildingData[buildingType]?.stature ?? 0

// Capture progress is only held while a unit occupies the building. The moment its
// occupant stops holding the tile — moving away or dying — the building heals back
// to full so progress can't be banked across moves or deaths. `occupantTeam` is the
// (former) occupant's team; a friendly building is never being captured, so it's a
// no-op there.
export const resetCaptureProgress = (
	building: BuildingObject | null | undefined,
	occupantTeam: number
): void => {
	if (!building) return
	if (building.team === occupantTeam) return
	const max = captureMaxStature(building.type)
	if (max > 0 && typeof building.stature === 'number' && building.stature < max) {
		building.stature = max
	}
}

export const captureReduction = (unit: UnitObject): number => {
	const maxHealth = unitData[unit.type]?.health ?? 0
	if (maxHealth <= 0) return 0
	const health = typeof unit.health === 'number' ? unit.health : maxHealth
	return Math.round((health / maxHealth) * 10)
}

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
