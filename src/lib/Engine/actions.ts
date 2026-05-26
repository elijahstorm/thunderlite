import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { generateAttackList } from './Interactor/Pathing/attack'
import { hasModifier } from './modifiers/canAttack'
import { canMineAt } from './modifiers/miner'
import { passableAdjacentTiles } from './modifiers/builder'
import {
	canShipOut,
	findFriendlyTransporters,
	hasRescuedUnit,
	landTiles,
} from './modifiers/transport'

export type ActionMenuItemId =
	| 'attack'
	| 'capture'
	| 'mine'
	| 'build'
	| 'repair'
	| 'transport'
	| 'ship_out'
	| 'land'
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

const canTransport = (map: MapObject, tile: number, unit: UnitObject): boolean => {
	if (!hasModifier(unit, 'Self_Action.Transport')) return false
	return findFriendlyTransporters(map, tile, unit.team).length > 0
}

const canShipOutHere = (map: MapObject, tile: number, _unit: UnitObject): boolean => {
	return canShipOut(map, tile)
}

const canLand = (map: MapObject, tile: number, unit: UnitObject): boolean => {
	if (!hasModifier(unit, 'Self_Action.Land')) return false
	if (!hasRescuedUnit(unit)) return false
	return landTiles(map, tile).length > 0
}

export const computeAvailableActions = (ctx: AvailableActionsContext): ActionMenuItem[] => {
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

	if (canTransport(map, tile, unit)) {
		items.push({ id: 'transport', enabled: true })
	}

	if (canShipOutHere(map, tile, unit)) {
		items.push({ id: 'ship_out', enabled: true })
	}

	if (canLand(map, tile, unit)) {
		items.push({ id: 'land', enabled: true })
	}

	if (isRepairable(unit)) {
		items.push({ id: 'repair', enabled: true })
	}

	items.push({ id: 'wait', enabled: true })

	return items
}
