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
	const building = ctx.map.layers.buildings[ctx.tile]
	if (!building) return
	if (building.team === unit.team) return

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
