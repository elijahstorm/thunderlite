import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { generateAttackList } from './Interactor/Pathing/attack'
import { hasModifier } from './modifiers/canAttack'
import { canMineAt } from './modifiers/miner'
import { passableAdjacentTiles } from './modifiers/builder'

export type ActionMenuItemId =
	| 'attack'
	| 'capture'
	| 'mine'
	| 'build'
	| 'repair'
	| 'wait'

export type ActionMenuItem = {
	id: ActionMenuItemId
	enabled: boolean
	reason?: string
}

export type AvailableActionsContext = {
	map: MapObject
	tile: number
	unit: UnitObject
}

const hasAttackableEnemy = (map: MapObject, tile: number, unit: UnitObject): boolean =>
	generateAttackList(map, tile, unit).length > 0

const isCapturable = (map: MapObject, tile: number, unit: UnitObject): boolean => {
	if (!hasModifier(unit, 'Start_Turn.Capture')) return false
	const building = map.layers.buildings[tile]
	if (!building) return false
	if (building.team === unit.team) return false
	return (buildingData[building.type]?.stature ?? 0) > 0
}

const isMineable = (map: MapObject, tile: number, unit: UnitObject): boolean => {
	if (!hasModifier(unit, 'Self_Action.Miner')) return false
	return canMineAt(map, tile)
}

const isBuilder = (map: MapObject, tile: number, unit: UnitObject): boolean => {
	if (!hasModifier(unit, 'Self_Action.Builder')) return false
	return passableAdjacentTiles(map, tile).length > 0
}

const isRepairable = (unit: UnitObject): boolean => {
	if (!hasModifier(unit, 'Self_Action.Repairable')) return false
	const max = unitData[unit.type]?.health ?? 0
	if (max <= 0) return false
	const current = typeof unit.health === 'number' ? unit.health : max
	return current < max
}

export const computeAvailableActions = (
	ctx: AvailableActionsContext
): ActionMenuItem[] => {
	const { map, tile, unit } = ctx
	const items: ActionMenuItem[] = []

	if (hasAttackableEnemy(map, tile, unit)) {
		items.push({ id: 'attack', enabled: true })
	}

	if (isCapturable(map, tile, unit)) {
		items.push({ id: 'capture', enabled: true })
	}

	if (isMineable(map, tile, unit)) {
		items.push({ id: 'mine', enabled: true })
	}

	if (isBuilder(map, tile, unit)) {
		items.push({ id: 'build', enabled: true })
	}

	if (isRepairable(unit)) {
		items.push({
			id: 'repair',
			enabled: false,
			reason: 'Repair not yet implemented (G4)',
		})
	}

	items.push({ id: 'wait', enabled: true })

	return items
}
