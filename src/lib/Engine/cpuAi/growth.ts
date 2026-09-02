import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { gameState } from '../gameState'
import { discountedUnitCost, isProducibleUnit, playerCanBuildType } from '../build'
import { DEPLETED_INCOME_FACTOR } from '../modifiers/supplyIncome'
import { isWalletUnit, walletOf } from '../wallet'
import { hasModifier } from '../modifiers/canAttack'
import { planningBuildings, planningUnits, planningGrowth } from './planningContext'
import { weights as W } from './weights'

// ── Is waiting actually worth anything? ─────────────────────────────────────
//
// `localCommitment` (score.ts) makes the CPU gather before it pushes: outnumbered
// where it stands, it flattens the advance pull and settles at the edge of contact
// until enough friends arrive to swing the local force ratio. That is the right
// instinct on a skirmish map, where every turn spent waiting is a turn the factory
// spends adding to the pile.
//
// It is exactly the WRONG instinct when nothing is coming. On a campaign map where
// the CPU owns no factory (or owns one it can never fund), the force ratio it is
// waiting to improve is the best ratio it will ever have. Every turn it holds, the
// player picks off another unit at leisure and the ratio it is waiting on gets
// worse — the CPU talks itself into a corner and dies there one unit at a time.
//
// And the combat math already knows the way out: `scoreAttack` nets the defender's
// return fire out of the damage dealt, so striking first is *priced* as the better
// side of the same exchange. A side that cannot replace losses should be spending
// that edge, not sitting on it.
//
// So massing is gated on whether waiting buys anything. This module answers that
// with a crude reinforcement rate — roughly "army value per turn this team can add"
// — for the CPU and for everyone facing it. It deliberately does NOT simulate the
// economy; it only needs to tell apart "reinforcements are coming" from "this is
// all I will ever have", and "we are growing faster than them" from "we are falling
// behind by waiting".

/**
 * Turns of banked money treated as sustained income. A pile of cash is a one-off,
 * not a rate, so spreading it over a few turns keeps a single fat reserve from
 * reading as a permanent factory. Short, because the CPU spends aggressively.
 */

/**
 * Prospective rate credited for "we have infantry and there is a factory on the
 * board we do not own". Capturing one is real growth and worth waiting a couple of
 * turns for, but it is a plan rather than an income, so it is priced well under a
 * factory that is already running.
 */

/** Cheapest unit `team` is actually allowed to produce from a factory, or Infinity. */
const cheapestBuildable = (player: {
	money: number
	controls?: { ground: number; air: number; sea: number }
}): number => {
	let cheapest = Infinity
	for (const data of unitData) {
		if (data.cost <= 0) continue
		if (!isProducibleUnit(data)) continue
		if (!playerCanBuildType(player, data.type)) continue
		const cost = discountedUnitCost(player, data)
		if (cost < cheapest) cheapest = cost
	}
	return cheapest
}

/** This turn's payout from a building, mirroring `supplyIncome`'s reservoir rules. */
export const buildingIncome = (building: BuildingObject): number => {
	const data = buildingData[building.type]
	const income = data?.income ?? 0
	if (income <= 0) return 0
	const reservoir = data?.resources ?? 0
	if (reservoir <= 0) return income
	const remaining = typeof building.resources === 'number' ? building.resources : reservoir
	if (remaining > 0) return Math.min(income, remaining)
	// Drained buildings never go silent, they just trickle.
	return Math.max(1, Math.round(income * DEPLETED_INCOME_FACTOR))
}

/**
 * Roughly how much army value `team` can add per turn: income it can convert into
 * units, banked cash amortised over {@link BANK_HORIZON}, scripted reinforcements
 * already telegraphed, and a small credit for a capture that would open production.
 * Zero means this team's army will never be bigger than it is right now.
 */
export const reinforcementRate = (map: MapObject, team: number): number => {
	const player = get(gameState).players.find((p) => p.team === team)
	let rate = 0

	// Scripted drops. `map.scheduledSpawns` only ever holds the next turn's spawns
	// (see Campaign/spawnTelegraph), so anything in it is reinforcement in hand.
	for (const spawn of map.scheduledSpawns ?? []) {
		if (spawn.team !== team) continue
		const cost = unitData[spawn.unitType]?.cost ?? 0
		rate += cost > 0 ? cost : 50
	}

	let ownsFactory = false
	let income = 0
	let capturableFactory = false
	for (const { tile, building } of planningBuildings(map)) {
		const data = buildingData[building.type]
		if (!data) continue
		if (building.team === team) {
			// A factory permanently squatted by an enemy produces nothing, but a tile
			// blocked by our own unit clears next turn — only the former disqualifies.
			if (data.actable) {
				const occupant = map.layers.units[tile]
				if (!occupant || occupant.team === team) ownsFactory = true
			}
			income += buildingIncome(building)
		} else if (data.actable) {
			capturableFactory = true
		}
	}

	if (player && ownsFactory) {
		const cheapest = cheapestBuildable(player)
		if (cheapest < Infinity) {
			// Income only counts as growth if it is being spent on something. With no
			// income at all, a standing reserve still buys a few more units.
			rate += income
			if (player.money >= cheapest) rate += player.money / W.BANK_HORIZON
		}
	}

	// A Warmachine is a walking factory funded by its own wallet (and refilled by
	// mining), so it is a production line the building scan never sees.
	for (const { unit } of planningUnits(map)) {
		if (unit.team !== team || !isWalletUnit(unit)) continue
		rate += walletOf(unit) / W.BANK_HORIZON
		if (hasModifier(unit, 'Self_Action.Miner')) rate += W.CAPTURE_PROSPECT_RATE
	}

	if (!ownsFactory && capturableFactory) {
		const canCapture = planningUnits(map).some(
			({ unit }) => unit.team === team && hasModifier(unit, 'Start_Turn.Capture')
		)
		if (canCapture) rate += W.CAPTURE_PROSPECT_RATE
	}

	return rate
}

/**
 * How much the CPU should trust waiting, in [0, 1].
 *
 * 1 — reinforcements arrive at least as fast as the opposition's, so gathering is
 *     free and `localCommitment` behaves as designed.
 * 0 — nothing is coming. Holding cannot improve the force ratio, only erode it, so
 *     caution is switched off entirely and the army pushes with the first-strike
 *     edge it still has.
 *
 * In between, the CPU is being out-produced: it gathers, but with less conviction
 * the further behind it is falling, because every turn it waits is a turn the gap
 * it is waiting to close grows.
 */
export const massingPatience = (map: MapObject, cpuTeam: number): number => {
	// No game state (the dev inspector, a unit-scoring test) means no economy to read.
	// Say nothing rather than "nothing is coming" — a missing store shouldn't silently
	// switch off massing for every caller that isn't a live match.
	if (get(gameState).players.length === 0) return 1
	const own = reinforcementRate(map, cpuTeam)
	if (own <= 0) return 0
	let hostile = 0
	for (const player of get(gameState).players) {
		if (player.team === cpuTeam || player.hasLost) continue
		hostile += reinforcementRate(map, player.team)
	}
	if (hostile <= own) return 1
	return own / hostile
}

/** {@link massingPatience}, memoised for the current planning tick. */
export const cachedMassingPatience = (map: MapObject, cpuTeam: number): number =>
	planningGrowth(map, cpuTeam, () => massingPatience(map, cpuTeam))
