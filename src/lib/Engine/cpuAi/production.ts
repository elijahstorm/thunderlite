import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { gameState } from '../gameState'
import { buildableUnits, canDeployFromFactory, type BuildableUnitsOptions } from '../build'
import { previewDamage } from '../combat'
import { unitTypeHasRadar, hasRadarField } from '../visibility'
import { lurkingStealthCount } from './stealthMemory'
import { factoryCount } from './evaluate'
import { sampleByScore } from './rng'
import type { SerializedAction } from '../Interactor/serializedAction'
import { weights as W } from './weights'

/**
 * How much of an enemy's return fire a candidate that OUTRANGES it still expects to
 * eat. Not zero: artillery gets closed on eventually, it just fires first and the
 * enemy spends a turn walking. Pricing standoff as untouchable makes the CPU field
 * nothing but glass cannons with no line to hide behind. See `counterEffectiveness`.
 */

type ArmyMix = {
	ground: number
	air: number
	sea: number
	antiAirCount: number
	totalEnemies: number
}

const sampleArmyMix = (map: MapObject, cpuTeam: number): ArmyMix => {
	const mix: ArmyMix = { ground: 0, air: 0, sea: 0, antiAirCount: 0, totalEnemies: 0 }
	for (const u of map.layers.units) {
		if (!u || u.team === cpuTeam) continue
		const data = unitData[u.type]
		if (!data) continue
		mix.totalEnemies++
		mix[data.type]++
		if (data.modifiers.includes('Can_Attack.Air_Raid')) mix.antiAirCount++
	}
	return mix
}

const isAntiAir = (unitType: number): boolean => {
	const data = unitData[unitType]
	return !!data && data.modifiers.includes('Can_Attack.Air_Raid')
}

const isCaptureCapable = (unitType: number): boolean => {
	const data = unitData[unitType]
	return !!data && data.modifiers.includes('Start_Turn.Capture')
}

/**
 * Would `enemy` actually get to shoot back at a freshly-built `unitType`?
 *
 * `counterEffectiveness` used to charge every candidate the enemy's full return
 * damage, with no notion of range at all — so a Mortar Truck that fires from two or
 * three tiles away and can never be counter-punched by a melee tank was priced as if
 * it stood toe to toe with one. That penalised indirect fire for the exact property
 * that makes it good, and the CPU never built a single ranged unit across a whole
 * match on a map that was two one-tile corridors.
 *
 * There are no tiles to work with at production time, so this models the standoff a
 * ranged attacker would actually choose (its maximum range) and applies the same
 * rules `canCounterAttack` enforces in combat: a silent unit can't retaliate, a
 * stunned one doesn't, a ranged defender only counters with Can_Attack.Counter_Range,
 * and the shot has to land inside the defender's own firing band.
 */
const wouldBeCountered = (unitType: number, enemy: UnitObject): boolean => {
	const attacking = unitData[unitType]
	const defending = unitData[enemy.type]
	if (!attacking || !defending) return false
	if (defending.power === 0) return false
	if (attacking.modifiers.includes('Attack.Stun')) return false
	const [defMin, defMax] = defending.range
	if (defMin >= 2 && !defending.modifiers.includes('Can_Attack.Counter_Range')) return false
	// A ranged attacker fires from the far edge of its band; a direct one is adjacent.
	const standoff = Math.max(1, attacking.range[1])
	return standoff >= defMin && standoff <= defMax
}

const findProducerBuildings = (map: MapObject, cpuTeam: number): number[] => {
	const out: number[] = []
	const acted = get(gameState).actedTiles
	for (let i = 0; i < map.layers.buildings.length; i++) {
		const b = map.layers.buildings[i]
		if (!b || b.team !== cpuTeam) continue
		const data = buildingData[b.type]
		if (!data || !data.actable) continue
		if (acted.has(i)) continue
		if (map.layers.units[i] != null) continue
		out.push(i)
	}
	return out
}

type StealthHunt = {
	// Enemy cloak units the CPU remembers but can't see right now.
	lurking: number
	// Jammer Trucks the CPU already fields — don't keep churning them out.
	ownRadar: number
}

/** Overall authority of the matchup term relative to the flat stat prior. */

/**
 * How close a unit has to rank to the best buy to be worth buying instead of it. In
 * build-score units, where the spread across the whole roster is roughly 100 points, so
 * this shuffles the genuinely comparable choices and never reaches a clearly worse one.
 * Variety in production matters more than variety anywhere else: an army assembled over
 * twenty turns is the most legible pattern a player can read off the CPU.
 */

/**
 * How well a freshly-built `unitType` matches up against the enemy army the CPU can
 * currently see. Runs the real combat math (weapon/armor matchup, Flak vs light armor,
 * etc.) against each enemy on its own tile — no lookahead, just "would this actually
 * hurt what they field, and survive what they bring back". Returns ~0 when there's
 * nothing to counter. This is what makes the CPU *react to what the player builds*.
 * `defenderTile` doubles as a terrain proxy for the incoming hit — rough, but enough
 * to bias production sensibly.
 *
 * Both sides of the exchange are priced in MONEY. They used to be plain fractions of
 * each unit's own health — "what share of them do I remove" against "what share of me
 * do they remove" — which quietly erased cost from a comparison that is entirely about
 * cost. A Heavy Commando trades 90% of itself to take 34% off an Annihilator Tank and
 * scored terribly for it, even though that is $90 spent to destroy $176, the best deal
 * on the board and the hard counter the unit table was designed around (a heavy weapon
 * lands 1.5x into heavy armour; three commandos, $300, kill a $525 tank while losing
 * $135). Pricing the trade in money is what lets the CPU see that.
 *
 * `richness` slides the denominator between the candidate's own price and the dearest
 * thing this player could build. Which one is right depends on the binding constraint:
 * a factory deploys once per turn, so a CPU sitting on a surplus should buy the most
 * valuable unit per BUILD SLOT, while a CPU scraping by should buy the most value per
 * DOLLAR. The same board wants different answers at $2000 and at $200.
 */
const counterEffectiveness = (
	map: MapObject,
	unitType: number,
	cpuTeam: number,
	enemies: { tile: number; unit: UnitObject }[],
	effectiveCost: number,
	topCost: number,
	richness: number
): number => {
	const data = unitData[unitType]
	if (!data || enemies.length === 0) return 0
	const fresh: UnitObject = { type: unitType, team: cpuTeam, health: data.health, state: 0 }
	const freshMax = data.health || 1
	const cost = effectiveCost > 0 ? effectiveCost : 1
	let offenseValue = 0
	let defenseValue = 0
	for (const { tile, unit } of enemies) {
		const ed = unitData[unit.type]
		if (!ed) continue
		const eMax = ed.health || 1
		const eHp = unit.health ?? eMax
		const eCost = ed.cost > 0 ? ed.cost : 50
		const out = previewDamage(fresh, unit, { map, defenderTile: tile, role: 'attack' })
		offenseValue += (Math.min(out, eHp) / eMax) * eCost
		const inc = previewDamage(unit, fresh, { map, defenderTile: tile, role: 'attack' })
		// A candidate that outranges this enemy doesn't trade blows with it: it fires
		// first and the enemy has to spend a turn closing. Discounted rather than
		// zeroed — artillery does get caught, and pricing it as untouchable makes the
		// CPU field nothing but glass cannons with no line to hide behind.
		const exposure = wouldBeCountered(unitType, unit) ? 1 : W.COUNTER_STANDOFF_EXPOSURE
		defenseValue += (Math.min(inc, freshMax) / freshMax) * cost * exposure
	}
	const net = (offenseValue - defenseValue) / enemies.length
	const denominator = cost + (Math.max(topCost, cost) - cost) * richness
	return (net / Math.max(1, denominator)) * W.COUNTER_WEIGHT
}

/**
 * How many turns of top-end production the treasury already covers before the CPU
 * should stop caring about price. A factory deploys once per turn, so
 * `factories × topCost` is exactly one turn of maximum spending; being able to do
 * that once is not wealth, it is this turn's purchase. Only a bank that can sustain
 * it for a few turns running means build slots — rather than money — are the real
 * limit. Three turns is roughly how long a unit takes to walk to a front on these
 * maps, so it is also the horizon over which a purchase has to pay off.
 */

/**
 * How far the treasury outruns what the CPU's factories can sustainably spend, 0..1.
 * 0 means every dollar is spoken for (buy the most value per dollar); 1 means it can
 * keep every build slot filled with top-end units regardless (buy the most value per
 * slot). See `counterEffectiveness`, which slides between those two readings.
 */
const spendingSlack = (money: number, factories: number, topCost: number): number => {
	const capacity = Math.max(1, factories) * Math.max(1, topCost) * W.SPENDING_SLACK_TURNS
	return Math.max(0, Math.min(1, money / capacity))
}

const scoreBuildChoice = (
	unitType: number,
	// Effective price from the funding source (control discounts applied), so a
	// discounted category correctly looks cheaper to the planner.
	effectiveCost: number,
	mix: ArmyMix,
	ownCaptureCount: number,
	enemyAirThreat: boolean,
	hunt: StealthHunt,
	counter: number
): number => {
	const data = unitData[unitType]
	if (!data) return -Infinity
	const cost = effectiveCost > 0 ? effectiveCost : 1

	let score = W.BUILD_BASE + (data.power + data.health) * W.BUILD_STAT_WEIGHT

	// Reward building a real counter to what the enemy currently fields.
	score += counter

	if (enemyAirThreat && isAntiAir(unitType)) score += W.ANTI_AIR_BONUS
	if (ownCaptureCount < 2 && isCaptureCapable(unitType)) score += W.CAPTURE_CAPABLE_BONUS
	if (data.movement >= 4) score += W.MOBILITY_BONUS

	// Cloak hunters: when the CPU believes ambushers lurk, it wants eyes. A first
	// Jammer Truck (mobile radar that flushes them and screens our line) is a high
	// priority; further ones taper off. Failing that, a cheap fast scout to probe.
	if (hunt.lurking > 0) {
		if (unitTypeHasRadar(unitType)) {
			// One mobile radar is plenty to sweep a hunch — don't stockpile jammers.
			score += hunt.ownRadar === 0 ? W.RADAR_HUNT_BONUS : 0
		} else if (data.movement >= 5 && cost <= 300 && data.sight > 0) {
			score += W.SCOUT_HUNT_BONUS
		}
	}

	return score - cost * W.BUILD_COST_WEIGHT
}

/**
 * Rank every unit the CPU can afford from a funding source, best first. Shared by
 * factory production (player money, gated by owned factories) and the Warmachine
 * builder (its own wallet, any unit type). `opts` is threaded straight into
 * {@link buildableUnits} to set the budget and lift the control gate. The
 * Warmachine planner walks the ranked list to skip choices it can't physically
 * deploy on the terrain around it (e.g. a sea unit on a landlocked tile).
 */
export const rankBuildableTypes = (
	map: MapObject,
	cpuTeam: number,
	opts: BuildableUnitsOptions = {}
): { type: number; score: number }[] => {
	const state = get(gameState)
	const player = state.players.find((p) => p.team === cpuTeam)
	if (!player) return []

	const mix = sampleArmyMix(map, cpuTeam)
	const enemyAirThreat = mix.air > 0 && mix.air * 3 >= mix.totalEnemies

	let ownCaptureCount = 0
	let ownRadar = 0
	for (const u of map.layers.units) {
		if (!u || u.team !== cpuTeam) continue
		if (isCaptureCapable(u.type)) ownCaptureCount++
		if (hasRadarField(u)) ownRadar++
	}
	const hunt: StealthHunt = { lurking: lurkingStealthCount(map, cpuTeam), ownRadar }

	// Visible enemy army, used to score how well each buildable type counters it.
	const enemies: { tile: number; unit: UnitObject }[] = []
	for (let i = 0; i < map.layers.units.length; i++) {
		const u = map.layers.units[i]
		if (u && u.team !== cpuTeam) enemies.push({ tile: i, unit: u })
	}

	const candidates = buildableUnits(player, opts)
	// The dearest thing this player is ALLOWED to build here (not merely what it can
	// afford right now), so the "could I fill every slot with a top-end unit" reading
	// stays stable while the treasury swings. On a ground-only map that is the
	// Annihilator Tank; a map with sea control raises it, which is correct.
	const topCost = candidates.reduce((top, c) => (c.controlled ? Math.max(top, c.cost) : top), 0)
	const richness = spendingSlack(player.money, factoryCount(map, cpuTeam), topCost)

	return candidates
		.filter((c) => c.buildable)
		.map((c) => ({
			type: c.type,
			score: scoreBuildChoice(
				c.type,
				c.cost,
				mix,
				ownCaptureCount,
				enemyAirThreat,
				hunt,
				counterEffectiveness(map, c.type, cpuTeam, enemies, c.cost, topCost, richness)
			),
		}))
		.sort((a, b) => b.score - a.score)
}

/**
 * The single highest-value unit the CPU should build, or null if it can afford
 * none. Thin wrapper over {@link rankBuildableTypes} for the factory path.
 */
export const bestBuildableType = (
	map: MapObject,
	cpuTeam: number,
	opts: BuildableUnitsOptions = {}
): { type: number; score: number } | null => rankBuildableTypes(map, cpuTeam, opts)[0] ?? null

export const pickBuildOnce = (map: MapObject, cpuTeam: number): SerializedAction | null => {
	const producers = findProducerBuildings(map, cpuTeam)
	if (producers.length === 0) return null

	const state = get(gameState)
	const player = state.players.find((p) => p.team === cpuTeam)
	if (!player) return null
	if (player.money <= 0) return null

	// A factory deploys onto its own tile, so a ship can only come from a coastal
	// (Shore) factory. Resolve the ranked wish-list down to the choices some idle
	// producer can physically launch — skipping, say, a top-ranked warship when every
	// free factory is landlocked, rather than emitting a build that no-ops on apply.
	const deployable: { type: number; score: number; producer: number }[] = []
	for (const { type, score } of rankBuildableTypes(map, cpuTeam)) {
		const producer = producers.find((p) => canDeployFromFactory(map, p, type))
		if (producer !== undefined) deployable.push({ type, score, producer })
	}
	// Then sample among the ones it rates as comparable, so an army built over twenty
	// turns isn't the same twenty units every game. Keyed by turn and remaining slots,
	// so a two-factory turn can pick differently for each.
	const choice = sampleByScore(
		deployable,
		W.BUILD_TEMPERATURE,
		state.turnNumber,
		cpuTeam,
		producers.length
	)
	if (!choice) return null
	return { kind: 'build', building: choice.producer, unitType: choice.type }
}
