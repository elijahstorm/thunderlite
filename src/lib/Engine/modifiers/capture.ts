import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'

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
