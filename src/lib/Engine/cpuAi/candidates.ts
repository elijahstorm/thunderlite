import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { hasModifier, isRanged } from '../modifiers/canAttack'
import { canMineAt } from '../modifiers/miner'
import { buildableAdjacentTiles } from '../modifiers/builder'
import { isWalletUnit, walletOf } from '../wallet'
import { generateMovementList } from '../Interactor/Pathing/movement'
import { generateAttackList } from '../Interactor/Pathing/attack'
import { concealedEnemyTiles } from '../visibility'
import { lurkingStealthCount } from './stealthMemory'
import { rankBuildableTypes } from './production'
import { enemyCount } from './evaluate'
import {
	scoreAttack,
	scoreCapture,
	scoreMine,
	scoreRepair,
	scorePositionBonus,
	scoreWait,
	scoreBuilderPosition,
	scoreBuilderMine,
	scoreBuilderBuild,
	scoreBuilderAttack,
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

	// A Warmachine is the player's life and economy — the CPU never uses it as an
	// attacker. It builds units from its wallet, mines ore to refill, and otherwise
	// retreats to safety, all scored to keep it alive (see generateBuilderPlans).
	if (isWalletUnit(unit)) {
		return generateBuilderPlans(map, unitTile, unit, cpuTeam, reachable, concealed)
	}

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
			// Capture is automatic at the start of the turn while the unit sits on the
			// building, so the plan is just "move onto it and hold" (a wait). Leaving
			// the tile would reset the building, so we never pair this with a follow-up.
			plans.push({
				unitTile,
				kind: 'capture',
				score: scoreCapture(map, dest, cpuTeam) + position * 0.5,
				actions: [...moveActions(unitTile, dest), { kind: 'wait', tile: dest }],
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

// Plans for a wallet/builder unit (Warmachine). Its life is the game, so the CPU
// leads with escaping danger, building units out of its wallet, and mining ore to
// keep that wallet full (urgent when low — it also drifts toward the nearest ore
// that still has funds). It *can* attack, but only as a heavy-hitter's
// opportunistic kill: when few enemies remain and the shot is a clean, safe kill
// it's worth full value, otherwise attacking is a damped last resort (see
// scoreBuilderAttack). Every other plan's score is anchored on staying alive.
const generateBuilderPlans = (
	map: MapObject,
	unitTile: number,
	unit: UnitObject,
	cpuTeam: number,
	reachable: number[],
	concealed: ReadonlySet<number>
): ActionPlan[] => {
	const plans: ActionPlan[] = []
	const wallet = walletOf(unit)
	const enemies = enemyCount(map, cpuTeam)
	// Units it can afford from its wallet, best first (any type — it's a mobile
	// factory). Per tile we deploy the best one that can physically stand on the
	// terrain around it, skipping e.g. a sea unit when landlocked.
	const ranked = rankBuildableTypes(map, cpuTeam, { budget: wallet, ignoreControls: true })
	// Ranged units fire from where they stand (no move-and-shoot); direct ones can
	// move then attack from the destination.
	const ranged = isRanged(unit)

	for (const dest of reachable) {
		const position = scoreBuilderPosition(map, dest, unit, cpuTeam, wallet, concealed)

		// Build an adjacent unit, paid from the wallet. Pick the highest-value
		// affordable type that actually has a legal deploy tile around `dest`.
		const buildPick = ranked.find((c) => buildableAdjacentTiles(map, dest, c.type).length > 0)
		if (buildPick) {
			plans.push({
				unitTile,
				kind: 'build',
				score: scoreBuilderBuild(buildPick.score, position),
				actions: [
					...moveActions(unitTile, dest),
					{ kind: 'build-adjacent', builder: dest, unitType: buildPick.type },
				],
			})
		}

		// Opportunistic attack — heavily situational (see scoreBuilderAttack).
		if (!ranged || dest === unitTile) {
			for (const targetTile of generateAttackList(map, dest, unit)) {
				const target = map.layers.units[targetTile]
				if (!target) continue
				const atk = scoreAttack(map, unit, dest, target, targetTile)
				plans.push({
					unitTile,
					kind: 'attack',
					score: scoreBuilderAttack(atk, enemies, position),
					actions: [...moveActions(unitTile, dest), { kind: 'attack', from: dest, to: targetTile }],
				})
			}
		}

		if (canMineFromTile(map, dest, unit)) {
			plans.push({
				unitTile,
				kind: 'mine',
				score: scoreBuilderMine(wallet) + position * 0.3,
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
			score: position,
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
