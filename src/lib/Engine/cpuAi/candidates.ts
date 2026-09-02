import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { hasModifier, isRanged } from '../modifiers/canAttack'
import { canMineAt } from '../modifiers/miner'
import { buildableAdjacentTiles } from '../modifiers/builder'
import { canLandPassengerAt } from '../modifiers/transport'
import { isWalletUnit, walletOf } from '../wallet'
import { generateMovementList } from '../Interactor/Pathing/movement'
import { generateAttackList } from '../Interactor/Pathing/attack'
import { planningConcealed } from './planningContext'
import { lurkingStealthCount } from './stealthMemory'
import { rankBuildableTypes } from './production'
import { enemyCount } from './evaluate'
import { sampleByScore } from './rng'
import { gameState } from '../gameState'
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
import { weights as W } from './weights'

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
	const concealed = planningConcealed(map, cpuTeam)
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

	// A loaded Transporter / Leviathan is a delivery in progress: it flies (or sails)
	// somewhere its passenger can stand and sets it down, or it keeps going. It has no
	// gun and can't capture, so none of the combat plans below apply to it.
	if (unit.rescuedUnit) {
		return generateCarrierPlans(map, unitTile, unit, cpuTeam, reachable, concealed, lurking)
	}

	// Ranged units may either move or attack in a turn, not both, so they can only
	// fire from their current tile. Direct units may move-then-attack from any destination.
	const ranged = isRanged(unit)

	for (const dest of reachable) {
		const position = scorePositionBonus(map, dest, unit, cpuTeam, concealed, lurking)

		if (!ranged || dest === unitTile) {
			// Pass the CPU's cached concealment (unit.team === cpuTeam) so the attack
			// list doesn't recompute an O(map) concealed set for every candidate tile.
			const targets = generateAttackList(map, dest, unit, concealed)
			for (const targetTile of targets) {
				const target = map.layers.units[targetTile]
				if (!target) continue
				const atk = scoreAttack(map, unit, dest, target, targetTile)
				// When the shot kills, the target won't be alive to retaliate next turn, so
				// drop it from the firing tile's survival term — otherwise the corpse would
				// scare the CPU off its own clean kill.
				const atkPosition = atk.killsTarget
					? scorePositionBonus(map, dest, unit, cpuTeam, concealed, lurking, targetTile)
					: position
				plans.push({
					unitTile,
					kind: 'attack',
					score: atk.score + atkPosition * 0.5,
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
			// Repair is a self-action on the tile the unit is already standing on, so it
			// pays that tile's positional price in full — exactly like waiting there.
			// Discounting it (this used to be `position * 0.2`) made "sit on the front
			// line and patch myself" the cheapest plan available whenever the tile was
			// dangerous, which is how a late-game army ends up half-idle. And a unit
			// above the repair threshold scores 0 for it, so without the guard a
			// worthless 9-HP top-up still out-ranked going somewhere useful.
			const repairValue = scoreRepair(unit)
			if (repairValue > 0) {
				plans.push({
					unitTile,
					kind: 'repair',
					score: repairValue + position,
					actions: [{ kind: 'repair', tile: dest }],
				})
			}
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

/** The single best score among a unit's plans (what it would actually pick, modulo sampling). */
const bestScore = (plans: readonly ActionPlan[]): number => {
	let best = -Infinity
	for (const plan of plans) if (plan.score > best) best = plan.score
	return best
}

// Plans for a carrier holding a passenger (a Transporter in the air, a Leviathan at
// sea). For every tile in the carrier's reach where the passenger could stand, a
// `land` plan: fly there and unload. It is scored as THE PASSENGER'S plan at that
// tile — the capture it would start, or the position it would hold — because that is
// who ends the turn standing there; the carrier itself ceases to exist on landing.
//
// Two shapes fall out of the acted-state rules (applyAction: unload keeps the tile's
// flag, move sets it):
//   • move → unload: the passenger lands spent, exactly as if it had walked there.
//   • unload in place (dest === unitTile): the passenger lands FREE and the tick loop
//     plans it as an ordinary unit next tick, so this plan is worth whatever the
//     passenger's best ordinary plan from here is — a land-then-attack needs no extra
//     machinery, just the bare unload emitted first.
// The carrier's own move-and-wait plans stay, priced by the hover / stranded
// penalties in scorePositionBonus, so it only keeps flying when nothing landable is
// in reach (or every landing is worse than another turn aloft).
const generateCarrierPlans = (
	map: MapObject,
	unitTile: number,
	unit: UnitObject,
	cpuTeam: number,
	reachable: number[],
	concealed: ReadonlySet<number>,
	lurking: number
): ActionPlan[] => {
	const plans: ActionPlan[] = []
	const passenger = unit.rescuedUnit
	if (!passenger) return plans

	for (const dest of reachable) {
		if (canLandPassengerAt(map, dest, passenger)) {
			let score: number
			if (dest === unitTile) {
				score = bestScore(generatePlansFor(map, dest, passenger, cpuTeam))
				if (!Number.isFinite(score)) score = 0
			} else {
				const position = scorePositionBonus(map, dest, passenger, cpuTeam, concealed, lurking)
				score = canCapture(map, dest, passenger)
					? scoreCapture(map, dest, cpuTeam) + position * 0.5
					: scoreWait(map, dest, passenger, cpuTeam, concealed, lurking)
			}
			plans.push({
				unitTile,
				kind: 'land',
				score: score + W.LAND_BONUS,
				actions: [
					...moveActions(unitTile, dest),
					{ kind: 'transport-unload', transport: dest, tile: dest },
				],
			})
		}

		if (dest === unitTile && canRepairUnit(unit)) {
			const repairValue = scoreRepair(unit)
			if (repairValue > 0) {
				plans.push({
					unitTile,
					kind: 'repair',
					score: repairValue + scorePositionBonus(map, dest, unit, cpuTeam, concealed, lurking),
					actions: [{ kind: 'repair', tile: dest }],
				})
			}
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
			for (const targetTile of generateAttackList(map, dest, unit, concealed)) {
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

/**
 * How close a plan has to be to the best one to be worth considering instead of it.
 * In plan-score units: a decisive attack scores in the hundreds and a positional
 * difference is worth tens, so this only ever shuffles genuinely comparable options —
 * a good shot is never passed up for a bad one. See `sampleByScore`.
 */

/**
 * ...but only when the decision is actually that wide. A unit crossing open ground has
 * no such spread: the advance pull is a couple of points per tile, so every tile in its
 * move range scores within a dozen points of every other, and a flat band of 18 sweeps
 * the WHOLE range into the pool at near-equal weight. The unit then takes an essentially
 * uniform draw over everywhere it can reach, every turn — which is the aimless shuffling
 * the slow heavies were doing on the approach. It was never indecision about where to
 * go; the sampler simply had more slack than the decision had signal.
 *
 * So the band is a fraction of the spread of the options on the table, capped at the
 * full temperature. A wide decision (a real shot against a mediocre one) keeps all of
 * it; a narrow one narrows with it, so the CPU still varies freely between tiles it
 * genuinely rates as equal and stops wandering off the one it rates best.
 */
/** Floor, so a set of exactly-equal plans still samples uniformly instead of collapsing
 * to whichever one happens to be generated first. */

/**
 * ...and how much of a gap inside that band actually decides the draw. Separate from
 * the band, and much smaller, because they do opposite jobs: the band is a safety rail
 * ("never reach past here"), the scale is the CPU's actual pickiness.
 *
 * Sharing one number made the band the pickiness too, and a band wide enough to be a
 * useful rail is far too wide to choose with: a plan 8 points off the best still drew
 * ~64% of its weight, so a board with one strong move and four merely acceptable ones
 * handed the strong move barely a quarter of the roll. The unit then usually took an
 * acceptable move — the exact "randomization is too strong" symptom, and it was never
 * the band leaking, it was the weights inside it being nearly flat.
 *
 * At 3, an option 3 points down draws ~37%, 8 points down ~7%, 15 points down ~1%. So
 * plans the scorer genuinely can't separate still share the roll (which is the whole
 * point of sampling), and anything it CAN separate loses.
 */

const planTemperature = (plans: readonly ActionPlan[]): number => {
	if (plans.length < 2) return 0
	let best = -Infinity
	let worst = Infinity
	for (const plan of plans) {
		if (plan.score > best) best = plan.score
		if (plan.score < worst) worst = plan.score
	}
	const spread = best - worst
	return Math.max(
		W.MIN_PLAN_TEMPERATURE,
		Math.min(W.PLAN_TEMPERATURE, spread * W.PLAN_SPREAD_FRACTION)
	)
}

export const bestPlanFor = (
	map: MapObject,
	unitTile: number,
	unit: UnitObject,
	cpuTeam: number
): ActionPlan | null => {
	const plans = generatePlansFor(map, unitTile, unit, cpuTeam)
	// Which of this unit's near-equal options it takes. Keyed by the unit's tile and
	// the turn so the same unit re-planning the same turn stays on its choice.
	const state = get(gameState)
	return sampleByScore(
		plans,
		{ band: planTemperature(plans), scale: W.PLAN_SOFTMAX_SCALE },
		state.turnNumber,
		cpuTeam,
		unitTile
	)
}
