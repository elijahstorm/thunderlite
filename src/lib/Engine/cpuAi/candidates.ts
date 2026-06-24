import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { hasModifier, isRanged } from '../modifiers/canAttack'
import { canMineAt } from '../modifiers/miner'
import { generateMovementList } from '../Interactor/Pathing/movement'
import { generateAttackList } from '../Interactor/Pathing/attack'
import { concealedEnemyTiles } from '../visibility'
import { lurkingStealthCount } from './stealthMemory'
import {
	scoreAttack,
	scoreCapture,
	scoreMine,
	scoreRepair,
	scorePositionBonus,
	scoreWait,
} from './score'
import type { ActionPlan } from './types'

const canCapture = (map: MapObject, tile: number, unit: UnitObject): boolean => {
	if (!hasModifier(unit, 'Start_Turn.Capture')) return false
	const building = map.layers.buildings[tile]
	if (!building) return false
	if (building.team === unit.team) return false
	return (buildingData[building.type]?.stature ?? 0) > 0
}

const canMineFromTile = (map: MapObject, tile: number, unit: UnitObject): boolean => {
	if (!hasModifier(unit, 'Self_Action.Miner')) return false
	return canMineAt(map, tile)
}

const canRepairUnit = (unit: UnitObject): boolean => {
	if (!hasModifier(unit, 'Self_Action.Repairable')) return false
	const max = unitData[unit.type]?.health ?? 0
	if (max <= 0) return false
	const current = typeof unit.health === 'number' ? unit.health : max
	return current < max
}

const moveActions = (from: number, to: number) =>
	from === to ? [] : [{ kind: 'move' as const, from, to }]

export const generatePlansFor = (
	map: MapObject,
	unitTile: number,
	unit: UnitObject,
	cpuTeam: number
): ActionPlan[] => {
	const plans: ActionPlan[] = []
	// The CPU plays blind: enemies it can't perceive (fog / stealth) are ghosts to
	// its pathing and scoring alike. Compute the set once and thread it everywhere
	// so reachability, threat and advance all agree on what the AI "knows".
	const concealed = concealedEnemyTiles(map, cpuTeam)
	// How much remembered-but-unseen enemy stealth there is, to temper how far the
	// unit is willing to push into the unknown (folded into the position score).
	const lurking = lurkingStealthCount(map, cpuTeam)
	const reachable = generateMovementList(map, unitTile, unit, concealed)
	// Ranged units may either move or attack in a turn, not both, so they can only
	// fire from their current tile. Direct units may move-then-attack from any destination.
	const ranged = isRanged(unit)

	for (const dest of reachable) {
		const position = scorePositionBonus(map, dest, unit, cpuTeam, concealed, lurking)

		if (!ranged || dest === unitTile) {
			const targets = generateAttackList(map, dest, unit)
			for (const targetTile of targets) {
				const target = map.layers.units[targetTile]
				if (!target) continue
				const atk = scoreAttack(map, unit, dest, target, targetTile)
				plans.push({
					unitTile,
					kind: 'attack',
					score: atk.score + position * 0.5,
					actions: [...moveActions(unitTile, dest), { kind: 'attack', from: dest, to: targetTile }],
				})
			}
		}

		if (canCapture(map, dest, unit)) {
			plans.push({
				unitTile,
				kind: 'capture',
				score: scoreCapture(map, dest, cpuTeam) + position * 0.5,
				actions: [...moveActions(unitTile, dest), { kind: 'capture', tile: dest }],
			})
		}

		if (canMineFromTile(map, dest, unit)) {
			plans.push({
				unitTile,
				kind: 'mine',
				score: scoreMine() + position * 0.3,
				actions: [...moveActions(unitTile, dest), { kind: 'mine', tile: dest }],
			})
		}

		if (dest === unitTile && canRepairUnit(unit)) {
			plans.push({
				unitTile,
				kind: 'repair',
				score: scoreRepair(unit) + position * 0.2,
				actions: [{ kind: 'repair', tile: dest }],
			})
		}

		plans.push({
			unitTile,
			kind: 'wait',
			score: scoreWait(map, dest, unit, cpuTeam, concealed, lurking),
			actions: [...moveActions(unitTile, dest), { kind: 'wait', tile: dest }],
		})
	}

	return plans
}

export const bestPlanFor = (
	map: MapObject,
	unitTile: number,
	unit: UnitObject,
	cpuTeam: number
): ActionPlan | null => {
	const plans = generatePlansFor(map, unitTile, unit, cpuTeam)
	let best: ActionPlan | null = null
	for (const plan of plans) {
		if (!best || plan.score > best.score) best = plan
	}
	return best
}
