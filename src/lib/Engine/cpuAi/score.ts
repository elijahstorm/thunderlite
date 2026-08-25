import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { previewDamage, canCounterAttack } from '../combat'
import { isStealthUnit, hasRadarField } from '../visibility'
import { hasAdjacentEnemy, adjacentTiles } from '../modifiers/cloak'
import { canAttackTarget, hasModifier } from '../modifiers/canAttack'
import { computeBehindTile } from '../modifiers/lance'
import { tilesInRange } from '../modifiers/radar'
import { strongestSuspicion } from './stealthMemory'
import { phantomThreatAt, exploreValue } from './fogMemory'
import { NEUTRAL_TEAM } from '../gameState'
import { planningUnits, planningBuildings } from './planningContext'
import {
	unitValue,
	terrainProtection,
	buildingValue,
	threatToTile,
	incomingThreatMoveAware,
	factoryCount,
	closestEnemyDistance,
	closestObjectiveDistance,
	closestOreDistance,
} from './evaluate'

const VALUE_PER_HP = 1 / 40

/**
 * Value destroyed by landing `damage` on `victim`: a killing blow takes everything
 * it has left, a sub-lethal one takes the fraction of its MAX health removed.
 *
 * This is the same pricing `expectedLossAt` uses for incoming fire, and for the same
 * reason. Offence used to be quoted as `damage × VALUE_PER_HP × unitValue` — a flat
 * "one HP is 1/40th of a unit", which is exactly right for the 40-HP commandos and
 * increasingly wrong as max health climbs: against a 140-HP Annihilator Tank it
 * over-rated chip damage by 3.5× (22 damage is 16% of that tank, but scored as 55%
 * of its value). That is what made the CPU feed units into the biggest thing on the
 * board for slivers of damage, and what collapsed late-game play into two Annihilator
 * lines head-butting at a chokepoint. Scaling by the victim's own max health puts
 * offence and defence in one currency.
 */
const damageValue = (victim: UnitObject, damage: number): number => {
	const data = unitData[victim.type]
	if (!data) return 0
	const max = data.health || 1
	const hp = victim.health ?? max
	const cost = data.cost > 0 ? data.cost : 50
	// A lethal hit is worth the target's remaining value — which is `unitValue`, so
	// the two branches meet continuously at `damage === hp`.
	if (damage >= hp) return cost * (hp / max)
	return cost * (damage / max)
}

export type AttackScore = {
	damage: number
	score: number
	killsTarget: boolean
	returnDamage: number
}

// Bonus added when an attack secures a kill on the tile *behind* the primary
// target (or, negated, the penalty for catching a friendly unit there). Mirrors
// the kill bonus in scoreAttack so a lance kill is valued like any other kill.
const LANCE_KILL_BONUS = 25

// A Lance Tank's shot also strikes the unit directly behind its target (see
// applyLancePassthrough). The CPU should hunt for shots that line a *second*
// enemy up behind the first — and avoid ones that would gore its *own* unit
// standing behind the target. Returns the extra value of that passthrough hit:
// positive for an enemy caught in the line, negative (same magnitude) for
// friendly fire, zero when the unit isn't a lance or nothing is behind.
const scoreLancePassthrough = (
	map: MapObject,
	attacker: UnitObject,
	attackerTile: number,
	targetTile: number
): number => {
	if (!hasModifier(attacker, 'Attack.Lance')) return 0
	const behind = computeBehindTile(map, attackerTile, targetTile)
	if (behind === null) return 0
	const victim = map.layers.units[behind]
	if (!victim) return 0
	// The shot overflies unit types the lance can't target (see applyLancePassthrough)
	// — no value in an untargetable enemy behind, no fear of an untargetable friendly.
	if (!canAttackTarget(attacker, victim)) return 0
	const stats = unitData[victim.type]
	if (!stats) return 0

	const max = stats.health || 1
	const current = victim.health ?? max
	const damage = previewDamage(attacker, victim, {
		map,
		defenderTile: behind,
		attackerTile,
		role: 'attack',
	})
	const kills = damage >= current
	const value = damageValue(victim, damage) + (kills ? LANCE_KILL_BONUS : 0)

	// Same team behind the target → friendly fire: dock the score by the same
	// amount the hit would have been worth against an enemy.
	return victim.team === attacker.team ? -value : value
}

// A splash attacker (Scorcher, Albatross Gunship, Breaker) also lands half-strength
// hits on every tile adjacent to its primary target (see applyAction's Attack.Splash).
// The wash is indiscriminate — it catches friendlies as well as foes — so this both
// rewards a shot ringed by enemies AND docks one that would scorch the CPU's own
// units, exactly like the Lance passthrough scoring. previewDamage folds in the
// attacker's own modifiers, so a Breaker's siege shells ignore the splashed units'
// cover here as they will in combat. Returns the net value: positive for enemies
// caught, negative for friendlies caught; 0 when the unit can't splash or stands alone.
const SPLASH_KILL_BONUS = 15
const SPLASH_MULTIPLIER = 0.5

const scoreSplashDamage = (
	map: MapObject,
	attacker: UnitObject,
	attackerTile: number,
	targetTile: number
): number => {
	if (!hasModifier(attacker, 'Attack.Splash')) return 0
	let total = 0
	for (const adj of adjacentTiles(map, targetTile)) {
		// The attacker never splashes itself, even firing point-blank (Scorcher melee).
		if (adj === attackerTile) continue
		const splashed = map.layers.units[adj]
		if (!splashed) continue
		if (!canAttackTarget(attacker, splashed)) continue
		const stats = unitData[splashed.type]
		if (!stats) continue
		const max = stats.health || 1
		const current = splashed.health ?? max
		const damage =
			previewDamage(attacker, splashed, {
				map,
				defenderTile: adj,
				attackerTile,
				role: 'attack',
			}) * SPLASH_MULTIPLIER
		const value = damageValue(splashed, damage) + (damage >= current ? SPLASH_KILL_BONUS : 0)
		// Same team caught in the wash → friendly fire: dock the score by what the
		// hit would have been worth against an enemy (mirrors scoreLancePassthrough).
		total += splashed.team === attacker.team ? -value : value
	}
	return total
}

// A Vulture Drone that lands a kill is freed to move and act again this turn
// (End_Turn.Vulture). A guaranteed kill is therefore worth more to it than to
// any other unit — it refunds the entire action. Reward securing the kill so the
// CPU lines up lethal shots over mere chip damage with its Vultures.
const VULTURE_KILL_BONUS = 30

const scoreVultureKill = (attacker: UnitObject, killsTarget: boolean): number => {
	if (!killsTarget) return 0
	if (!hasModifier(attacker, 'End_Turn.Vulture')) return 0
	return VULTURE_KILL_BONUS
}

export const scoreAttack = (
	map: MapObject,
	attacker: UnitObject,
	attackerTile: number,
	defender: UnitObject,
	defenderTile: number
): AttackScore => {
	const damage = previewDamage(attacker, defender, {
		map,
		defenderTile,
		attackerTile,
		role: 'attack',
	})

	const defStats = unitData[defender.type]
	const defMax = defStats?.health ?? 1
	const defCurrent = defender.health ?? defMax
	const killsTarget = damage >= defCurrent

	let returnDamage = 0
	if (!killsTarget) {
		const counterOk = canCounterAttack(attacker, defender, {
			map,
			attackerTile,
			defenderTile,
		})
		if (counterOk) {
			const simulated: UnitObject = {
				...defender,
				health: Math.max(0, defCurrent - damage),
			}
			returnDamage = previewDamage(simulated, attacker, {
				map,
				defenderTile: attackerTile,
				attackerTile: defenderTile,
				role: 'counter',
			})
		}
	}

	const av = unitValue(attacker)
	const atkStats = unitData[attacker.type]
	const atkMax = atkStats?.health ?? 1
	const atkCurrent = attacker.health ?? atkMax
	// Trading the attacker away is not the same as taking a scratch. The old scorer
	// only priced the return DAMAGE, so a half-dead tank that would die to the counter
	// looked barely worse than one that would survive it — which is how 39% of the
	// deaths in a real match came from the CPU walking into counterattacks it chose.
	// A counter that kills costs the attacker's whole remaining value, weighted the
	// same way `expectedLossAt` weights certain death so it always ranks below living.
	const attackerDies = returnDamage >= atkCurrent
	const damageValueOut = damageValue(defender, damage)
	const damageValueIn = attackerDies ? av * LETHAL_PENALTY : damageValue(attacker, returnDamage)

	let score = damageValueOut - damageValueIn
	if (killsTarget) score += 25
	if (killsTarget && !defStats) score = 0

	// Fold in unit-specific attack quirks: a Lance Tank's passthrough hit on the
	// tile behind the target (bonus for an enemy, penalty for a friendly), and a
	// Vulture Drone's free follow-up action when the shot kills.
	score += scoreLancePassthrough(map, attacker, attackerTile, defenderTile)
	score += scoreSplashDamage(map, attacker, attackerTile, defenderTile)
	score += scoreVultureKill(attacker, killsTarget)

	return { damage, score, killsTarget, returnDamage }
}

export const scoreCapture = (map: MapObject, tile: number, cpuTeam: number): number => {
	return buildingValue(map, tile, cpuTeam) * 0.5
}

export const scoreMine = (): number => 35

export const scoreRepair = (unit: UnitObject): number => {
	const data = unitData[unit.type]
	if (!data) return 0
	const max = data.health || 1
	const hp = unit.health ?? max
	const ratio = hp / max
	if (ratio >= 0.8) return 0
	const cost = data.cost > 0 ? data.cost : 50
	return (1 - ratio) * cost * 0.15
}

// Stealth units earn their keep cloaked, as invisible area-denial: an enemy can't
// path through a tile it doesn't know is occupied, so a hidden Stealth Tank / sub
// silently walls a lane. Reward an owned stealth unit for holding a forward tile
// while staying hidden, and dock it for ending adjacent to an enemy (which flushes
// it out — an attack that wants that trade is scored separately via scoreAttack).
// `enemyDist` is the already-computed blind closest-enemy distance.
const scoreStealthPositioning = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number,
	enemyDist: number
): number => {
	if (!isStealthUnit(unit)) return 0
	if (hasAdjacentEnemy(map, tile, cpuTeam)) return -unitValue(unit) * 0.05
	const forward = enemyDist > 0 ? Math.max(0, 8 - enemyDist) : 0
	return forward * 1.2
}

const manhattan = (map: MapObject, a: number, b: number): number =>
	Math.abs((a % map.cols) - (b % map.cols)) +
	Math.abs(Math.floor(a / map.cols) - Math.floor(b / map.cols))

// How good a unit is as an expendable scout — cheap, fast, and with working eyes.
// A throwaway recon buggy scores ~1, a slow heavyweight ~0, so the hunt only ever
// diverts units the CPU can afford to lose poking at a ghost.
const proberWeight = (unit: UnitObject): number => {
	const d = unitData[unit.type]
	if (!d) return 0
	const cheap = 1 - Math.min(d.cost ?? 0, 600) / 600
	const mobile = Math.min((d.movement ?? 0) / 6, 1)
	const eyes = (d.sight ?? 0) > 0 ? 1 : 0.5
	return Math.max(0, cheap * 0.5 + mobile * 0.5) * eyes
}

const HUNT_REACH = 9 // tiles within which closing on the hunch starts to pay
const HUNT_STEP = 0.5 // prober pull per tile closer to the hunch
const HUNT_FLUSH = 24 // ending adjacent to the hunch breaks the cloak — the whole point
const HUNT_RADAR_COVER = 14 // a jammer whose ring lands on the hunch — flush it out
const HUNT_RADAR_STEP = 0.7 // jammer pull per tile while not yet covering it
const HUNT_GUARD = 0.015 // jammer reward per point of friendly value its ring screens
const PHANTOM_WEIGHT = 0.02 // fog-belief caution per point of unit value, per believed-danger
const EXPLORE_WEIGHT = 0.5 // scout pull per fresh fog tile a move would uncover

// Steer the hunt for a remembered-but-unseen cloaked enemy. With `lurking > 0` and a
// live hunch (see stealthMemory.ts):
//   • a Jammer Truck is rewarded for landing its radar ring on the hunch and for
//     parking it over the CPU's own valuable units as a screen;
//   • any ground/sea unit is strongly rewarded for a move that ends ADJACENT to the
//     hunch — that's what actually flushes a non-radar reveal — so the nearest capable
//     unit closes in to break the cloak rather than sitting and waiting;
//   • from further out, cheap probes are pulled in to set up next turn's flush.
// Every pull is scaled by `safety` (the tile's incoming enemy fire) so the CPU won't
// chase a decoy deep into known enemy territory and get itself killed. Returns 0 (no
// behaviour change) when nothing is lurking or no hunch exists.
export const scoreStealthHunt = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number,
	lurking: number,
	concealed?: ReadonlySet<number>
): number => {
	if (lurking <= 0) return 0
	const focus = strongestSuspicion(cpuTeam)
	if (!focus) return 0
	const dist = manhattan(map, tile, focus.tile)
	const weight = focus.heat * lurking

	if (hasRadarField(unit)) {
		const [min, max] = unitData[unit.type]?.range ?? [0, 0]
		const covers = dist >= min && dist <= max
		const sweep = covers ? HUNT_RADAR_COVER : Math.max(0, HUNT_REACH - dist) * HUNT_RADAR_STEP
		// Screen value: friendly units the ring would shelter from ambush.
		let screened = 0
		for (const ringTile of tilesInRange(map, tile, min, max)) {
			const ally = map.layers.units[ringTile]
			if (ally && ally.team === cpuTeam) screened += unitValue(ally)
		}
		return weight * sweep + screened * HUNT_GUARD * Math.min(lurking, 3)
	}

	// Anti-bunching: the more units already sitting on/around the best guess, the less
	// a fresh one gains by crowding in — so they fan out instead of all stacking.
	let nearby = 0
	for (const t of [focus.tile, ...adjacentTiles(map, focus.tile)]) {
		const f = map.layers.units[t]
		if (f && f.team === cpuTeam && !hasRadarField(f)) nearby++
	}
	const crowd = 1 / (1 + nearby)

	// Don't chase into a death trap: damp the pull by how much fire this tile takes.
	const danger = threatToTile(map, tile, unit, cpuTeam, concealed) * VALUE_PER_HP
	const safety = 1 / (1 + danger)

	if (dist === 1) {
		// Ending adjacent flushes the cloak THIS move — open to any unit, not just cheap
		// probes, since revealing it is worth a real unit's action when it's safe to do.
		return weight * HUNT_FLUSH * safety * crowd
	}

	// Further out: close the gap so we can flush next turn; cheap units lead the long
	// approach (a heavyweight shouldn't wander off-objective chasing a rumour).
	return weight * proberWeight(unit) * Math.max(0, HUNT_REACH - dist) * HUNT_STEP * safety * crowd
}

// Value the unit expects to LOSE by ending its turn on `tile`, given everything that
// can shoot it there. The old scorer priced this as `incoming × VALUE_PER_HP × value`,
// a flat "fraction of a ~160-HP unit" — which under-priced the death of low-HP units
// by ~4× (a 40-HP infantryman that gets wiped loses its WHOLE value, not a quarter).
// That is exactly why the CPU walked units into kill zones for a sliver of chip damage.
// Here a LETHAL incoming total costs the unit's full current value (×LETHAL_PENALTY, so
// certain death always ranks below barely surviving); sub-lethal damage costs the value
// of the HP actually lost — both scaled by the unit's own max HP, not a global constant.
// `ignoreTile` drops one attacker (the target of a killing blow, which won't shoot back).
const LETHAL_PENALTY = 1.2

export const expectedLossAt = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number,
	concealed?: ReadonlySet<number>,
	ignoreTile?: number
): number => {
	const incoming = threatToTile(map, tile, unit, cpuTeam, concealed, ignoreTile)
	if (incoming <= 0) return 0
	const data = unitData[unit.type]
	if (!data) return 0
	const max = data.health || 1
	const hp = unit.health ?? max
	const cost = data.cost > 0 ? data.cost : 50
	if (incoming >= hp) return cost * (hp / max) * LETHAL_PENALTY
	return cost * (incoming / max)
}

// A ranged unit fires from where it stands and can't move-and-shoot, so its ideal
// resting spot is standoff distance: close enough that a stationary enemy is inside
// its firing band next turn, but never closer. The plain `advance` term pulls every
// unit monotonically toward the enemy/objective, which marched a ranged unit that had
// no shot this turn straight up to (and into) the enemy line — where it can't fire and
// just eats damage. This peaks (neutral, 0) anywhere inside the firing band, pulls the
// unit in from beyond it, and penalizes creeping inside min range (both exposed and
// unable to shoot). `enemyDist` is the blind closest-enemy distance; 0 means no known
// enemy, so there's nothing to stand off from.
const RANGED_APPROACH_PULL = 0.5 // per tile, closing the gap from beyond firing range
const RANGED_CLOSE_PENALTY = 2 // per tile, for creeping inside the standoff distance

const rangedStandoff = (enemyDist: number, minRange: number, maxRange: number): number => {
	if (enemyDist <= 0) return 0
	if (enemyDist > maxRange) return -(enemyDist - maxRange) * RANGED_APPROACH_PULL
	if (enemyDist >= minRange) return 0
	return -(minRange - enemyDist) * RANGED_CLOSE_PENALTY
}

// ── Massing: commit as an army, not as a queue ──────────────────────────────
//
// Every other term judges a unit alone: what it can hit from a tile, what can hit it
// back, how far the objective is. That makes the CPU purely tactical, and on a big
// board it shows. Reinforcements walk out of the home factory one at a time, each
// independently deciding the advance is fine, and each arrives at an established enemy
// line by itself and dies. In the match this came from, a Heavy Commando spent fifteen
// rounds crossing the map to die on arrival, and it was not the only one.
//
// The missing idea is force ratio: whether the CPU is locally strong enough to be
// pushing at all. This weighs friendly against enemy value around the tile being
// considered (closer units counting for more) and turns it into a factor that scales
// how hard the unit is pulled forward.
//
// The behaviour that falls out needs no explicit rally point. Far from contact there is
// nothing to be outnumbered by, so units march at full speed. Approaching a defended
// front the ratio drops, the pull flattens, and they settle just outside it instead of
// walking in. Every new arrival raises the local friendly value, and once the group
// outweighs what it faces the whole line advances together. Lose the exchange and the
// ratio falls again, so the survivors hold for the next wave rather than trickling in.
//
// Scouts are exempt. `proberWeight` already scores "cheap, fast, has eyes", and going
// forward alone is precisely a scout's job — gating recon behind a favourable force
// ratio would blind the CPU exactly when it most needs to look.
const SUPPORT_RADIUS = 4
// Local value share at or below which the CPU is outmatched and should gather.
const HOLD_SHARE = 0.35
// Share at or above which it commits at full strength.
const COMMIT_SHARE = 0.6
// Floor, so a badly outnumbered unit still drifts toward the fight rather than
// freezing forever — the advance never switches off, it only loses priority.
const MIN_COMMITMENT = 0.15
// Value at which a unit stops being expendable pressure and becomes an investment worth
// protecting.
//
// Waiting for a decisive mass is only half the answer. On a big or many-player map that
// decisive moment may never arrive, and a CPU that holds its whole army back concedes
// every neutral building and every tempo advantage while it waits for a threshold that
// only moves further away. Cheap units are supposed to keep poking — that is what they
// are for — while the expensive core gathers behind them. So this is a gradient, not a
// switch: a Strike Commando skirmishes almost freely, a Scorpion Tank hesitates, an
// Annihilator Tank waits for the line.
//
// This deliberately does NOT use `proberWeight` (the "should this unit chase a stealth
// rumour" score), even though "is it a scout" was the obvious question to ask. That
// function is half mobility, so a $270 Scorpion Tank with movement 6 scores 0.775 and
// would count as a scout — fast is not the same as expendable, and treating it that way
// sent exactly the wrong units forward alone. What matters here is only what losing the
// unit costs. Dedicated recon is cheap by definition and lands high on this scale
// anyway (an Outrider at 0.66, a Kestrel Sentry at 0.57), so it still ranges freely
// without needing a carve-out. And because `unitValue` scales with current health, a
// badly wounded heavy becomes expendable again, which is the right instinct for
// something about to die regardless.
const SKIRMISHER_VALUE = 350

/** 0 = an investment that should wait for support, 1 = expendable pressure. */
const expendability = (unit: UnitObject): number =>
	1 - Math.min(1, unitValue(unit) / SKIRMISHER_VALUE)

const localCommitment = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number,
	concealed?: ReadonlySet<number>
): number => {
	// Seed with the unit itself: it is part of the force it is deciding to commit.
	let friendly = unitValue(unit)
	let hostile = 0
	for (const { tile: i, unit: other } of planningUnits(map)) {
		// The mover is still sitting on its old tile in the layers; counting it there
		// as well as in the seed would inflate its own support.
		if (other === unit) continue
		const distance = manhattan(map, i, tile)
		if (distance > SUPPORT_RADIUS) continue
		const weight = 1 - distance / (SUPPORT_RADIUS + 1)
		if (other.team === cpuTeam) {
			friendly += unitValue(other) * weight
		} else {
			// The CPU plays blind: an enemy it cannot perceive can't deter it.
			if (concealed?.has(i)) continue
			hostile += unitValue(other) * weight
		}
	}
	if (hostile <= 0) return 1
	const share = friendly / (friendly + hostile)
	const ramp = (share - HOLD_SHARE) / (COMMIT_SHARE - HOLD_SHARE)
	const commitment = Math.max(MIN_COMMITMENT, Math.min(1, ramp))
	// Lerp back toward "commit anyway" by how expendable the unit is, so the caution
	// lands on the units that are worth being cautious with and cheap pressure keeps
	// flowing while the heavies gather behind it.
	return commitment + (1 - commitment) * expendability(unit)
}

// Scaling the advance pull by `commitment` alone barely moved the CPU: `advance` is a
// handful of points, while the threat and attack terms are worth tens to hundreds, so
// flattening it changed almost nothing. Over-extension needs authority proportional to
// what is actually being risked — the same shape `expectedLossAt` uses, a fraction of
// the unit's own value — or a $525 tank will keep walking into a line on its own for
// the sake of a 7-point objective pull.
//
// This is the cost of standing at the front with nobody behind you. It fades to nothing
// at `SUPPORT_RADIUS` (out of contact, it does not apply) and vanishes when the CPU is
// locally strong (commitment 1), so it only ever bites on the exact case it is for:
// a unit pushing into a fight its side is losing. It is a positional cost, so a unit
// that IS already there and has a good shot still takes it — attacks are scored
// separately and outweigh this.
const OVEREXTEND_WEIGHT = 0.35

const overextensionCost = (unit: UnitObject, enemyDist: number, commitment: number): number => {
	if (commitment >= 1) return 0
	if (enemyDist <= 0 || enemyDist > SUPPORT_RADIUS) return 0
	const frontProximity = 1 - (enemyDist - 1) / SUPPORT_RADIUS
	return (1 - commitment) * frontProximity * unitValue(unit) * OVEREXTEND_WEIGHT
}

// How close (Manhattan) an enemy may sit to a building before the CPU treats it as
// under threat and pulls a defender back.
const DEFEND_RANGE = 4

// The old scorer only pulled units TOWARD enemy/neutral objectives — it had no notion
// of guarding its own, so the player could march a captor onto a CPU building (or the
// insta-lose HQ) unopposed. This rewards a unit for holding a tile on/near a CPU
// building that an enemy capture-capable unit is closing on, weighted by what losing
// the building costs and how imminent the threat is. The 1/(1+dist) falloff means the
// *nearest* unit answers rather than the whole army collapsing home.
const homeDefenseBonus = (map: MapObject, tile: number, cpuTeam: number): number => {
	// Both loops walk compact lists (via planningContext) rather than the
	// tile-indexed layer arrays — this nested scan used to be O(map tiles²) per
	// candidate tile, which alone made big boards crawl. The capture-capable enemy
	// list is invariant across a candidate scan, so it's derived once here.
	const captors = planningUnits(map).filter(
		({ unit }) => unit.team !== cpuTeam && hasModifier(unit, 'Start_Turn.Capture')
	)
	let best = 0
	for (const { tile: i, building: b } of planningBuildings(map)) {
		if (b.team !== cpuTeam) continue
		const data = buildingData[b.type]
		if (!data) continue
		const insta = data.modifiers.includes('Capture.Insta_Lose')
		const importance = insta ? 4000 : (data.actable ? 500 : 0) + data.income * 2
		if (importance <= 0) continue
		// Nearest enemy that can actually capture this building.
		let de = Infinity
		for (const { tile: j } of captors) {
			const d = manhattan(map, j, i)
			if (d < de) de = d
		}
		if (de > DEFEND_RANGE) continue
		const urgency = DEFEND_RANGE - de + 1
		const dt = manhattan(map, tile, i)
		const pull = (importance * 0.01 * urgency) / (1 + dt)
		if (pull > best) best = pull
	}
	return best
}

// Value of parking a unit on an enemy's unit-producing building (its Warfactory) to
// choke production. While any unit sits on a factory tile the owner can't even open the
// build menu there (see the `select` interactor) — so a held block denies them a unit's
// worth of production every turn it lasts. But it ONLY pays if the blocker SURVIVES: a
// unit the enemy can kill on their turn just gets shot off, freeing the factory and
// throwing the blocker away. So the bonus is gated on the tile being un-killable for
// this unit next turn — measured move-aware (counting enemies that close in to fire),
// which is exactly "they can't kill the unit placed there in the same turn". The reward
// is split across the owner's factories: blocking their sole factory is devastating, one
// of several far less so. Returns 0 for our own / neutral buildings and non-factories.
const FACTORY_BLOCK_BONUS = 320

// Only Start_Turn.Capture units (the commandos, the Intrepid) can actually take a
// building, but the `advance` term pulls EVERY unit toward the nearest objective. A
// tank therefore drifts onto a capturable tile it can never claim and then holds it,
// locking out the one unit that could — in the match this came from, a neutral Oil
// Refinery sat uncaptured for eight rounds with an Annihilator Tank parked on it,
// repairing. Dock a non-captor for ending on the prize itself. Deliberately small: it
// nudges the tank one tile off the building without unwinding the approach, and it is
// an order of magnitude below FACTORY_BLOCK_BONUS so a chosen factory block still wins.
const OBJECTIVE_SQUAT_PENALTY = 40

const scoreObjectiveSquat = (map: MapObject, tile: number, unit: UnitObject, cpuTeam: number) => {
	if (hasModifier(unit, 'Start_Turn.Capture')) return 0
	const building = map.layers.buildings[tile]
	if (!building) return 0
	if (building.team === cpuTeam) return 0
	if ((buildingData[building.type]?.stature ?? 0) <= 0) return 0
	return OBJECTIVE_SQUAT_PENALTY
}

// A factory can't deploy while ANY unit stands on its tile (see the `select`
// interactor and `findProducerBuildings`) — including one of ours. The CPU had no
// term for that, and `homeDefenseBonus` peaks at distance 0, so its own defenders
// parked directly on the Warfactory they were guarding: across a four-way sim a team's
// factory was blocked by its own unit on 28 of 30 turns, it used 21 of 30 build slots,
// and it sat on an average bank of $476 it had no way to spend. A newly built unit also
// spawns on the tile, so without this nothing ever tells it to step aside.
//
// Priced a little above the most `homeDefenseBonus` can offer on the tile itself, so a
// guard shifts one square off the building and defends from there — still able to shoot
// a captor, no longer costing a unit of production every turn. It stays a penalty rather
// than a veto: a strong attack from that tile can still be worth the slot.
const SELF_FACTORY_BLOCK_PENALTY = 60

const scoreSelfFactoryBlock = (map: MapObject, tile: number, cpuTeam: number): number => {
	const building = map.layers.buildings[tile]
	if (!building || building.team !== cpuTeam) return 0
	return buildingData[building.type]?.actable ? SELF_FACTORY_BLOCK_PENALTY : 0
}

const scoreFactoryBlock = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number,
	concealed?: ReadonlySet<number>
): number => {
	const building = map.layers.buildings[tile]
	if (!building) return 0
	if (!buildingData[building.type]?.actable) return 0
	// Only worth denying an actual opponent's factory — not our own, not an unclaimed one.
	if (typeof building.team !== 'number') return 0
	if (building.team === cpuTeam || building.team === NEUTRAL_TEAM || building.team < 0) return 0
	// The block only holds if the enemy can't kill the blocker on their turn; otherwise
	// they evict it and build as normal, so it's not worth committing a unit.
	const max = unitData[unit.type]?.health ?? 1
	const hp = unit.health ?? max
	if (incomingThreatMoveAware(map, tile, unit, cpuTeam, concealed) >= hp) return 0
	return FACTORY_BLOCK_BONUS / Math.max(1, factoryCount(map, building.team))
}

// One of the CPU's own scripted reinforcements is telegraphed onto this tile next
// turn (map.scheduledSpawns; see Campaign/spawnTelegraph.ts). A drop blocked by the
// CPU's own unit is forfeited (campaignInterface.spawn), so ending here costs the
// value of the incoming unit — the AI drifts off to let the reinforcement land.
// It's only a *penalty*, not a veto: a strong attack or a factory block this turn
// can still outweigh it, in which case the CPU holds and sacrifices the drop. That
// "hold vs. vacate" trade is the whole point. `REINFORCEMENT_WEIGHT` tunes how
// hard the CPU protects the landing zone.
const REINFORCEMENT_WEIGHT = 0.5
const scoreReinforcementTile = (map: MapObject, tile: number, cpuTeam: number): number => {
	const scheduled = map.scheduledSpawns
	if (!scheduled || scheduled.length === 0) return 0
	let penalty = 0
	for (const s of scheduled) {
		if (s.tile !== tile || s.team !== cpuTeam) continue
		// A fresh reinforcement lands at full HP, so its value is just its cost
		// (mirrors unitValue for a full-health unit); fall back like unitValue does.
		const cost = unitData[s.unitType]?.cost ?? 0
		penalty += (cost > 0 ? cost : 50) * REINFORCEMENT_WEIGHT
	}
	return penalty
}

// `concealed` (enemies the CPU can't perceive) is threaded into the threat and
// closest-enemy terms so the AI scores positions blind to fogged/stealthed foes.
// `lurking` is the count of enemy stealth units the CPU *remembers but can't see*
// (see stealthMemory.ts) — it makes the AI hesitate to expose itself near the front
// where a remembered ambush could spring. `ignoreThreatTile` drops one enemy from the
// survival term, for scoring an attack that kills its target (the corpse can't return
// fire next turn). All default to no-op so the inspector and tests get the plain score.
export const scorePositionBonus = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number,
	concealed?: ReadonlySet<number>,
	lurking: number = 0,
	ignoreThreatTile?: number
): number => {
	const cover = terrainProtection(map, tile, unit) * unitValue(unit) * 0.05
	const threat = expectedLossAt(map, tile, unit, cpuTeam, concealed, ignoreThreatTile)
	const objectiveDist = closestObjectiveDistance(map, tile, cpuTeam)
	const enemyDist = closestEnemyDistance(map, tile, cpuTeam, concealed)
	// Capture-capable units feel the objective pull harder — they're the only ones who
	// can actually take a building — so they press in instead of milling at the front.
	const objWeight = hasModifier(unit, 'Start_Turn.Capture') ? 3 : 1.5
	// Ranged units (min range ≥ 2, and never capture-capable here) seek standoff instead
	// of charging: hold the enemy at firing distance rather than closing onto the front.
	const [minRange, maxRange] = unitData[unit.type]?.range ?? [0, 0]
	// Scale the pull forward by whether this unit is part of a force that can actually
	// win where it is going. Flattening the pull (rather than reversing it) is what
	// makes units gather at the edge of contact instead of filing into it one by one.
	const commitment = localCommitment(map, tile, unit, cpuTeam, concealed)
	const advance =
		commitment *
		(minRange >= 2
			? rangedStandoff(enemyDist, minRange, maxRange)
			: objectiveDist > 0
				? -objectiveDist * objWeight
				: -enemyDist * 0.5)
	// Cost of holding a forward tile while the local force ratio is against us.
	const overextend = overextensionCost(unit, enemyDist, commitment)
	const defense = homeDefenseBonus(map, tile, cpuTeam)
	const stealth = scoreStealthPositioning(map, tile, unit, cpuTeam, enemyDist)
	const caution = lurking * Math.max(0, 6 - enemyDist) * 0.4
	const hunt = scoreStealthHunt(map, tile, unit, cpuTeam, lurking, concealed)
	// Fog caution: shy away from regions a contact recently vanished into. Scaled by
	// unit value (like the visible-threat term) so the CPU won't shove a costly unit
	// blindly into the dark, while cheap scouts stay willing to go look.
	const phantom = phantomThreatAt(map, cpuTeam, tile) * unitValue(unit) * PHANTOM_WEIGHT
	// Exploration: with fog on and nothing in sight, reward peeling back the unknown so
	// the CPU goes looking instead of turtling. Cheap units lead the scouting; costly
	// ones (1 − value/600, floored) stay home rather than blunder into the dark.
	const explore =
		exploreValue(map, tile, unit, cpuTeam) *
		Math.max(0.2, 1 - unitValue(unit) / 600) *
		EXPLORE_WEIGHT
	// Choke enemy production by ending on (and thus occupying) their factory — only
	// counted when the blocker can't be killed off it next turn (see scoreFactoryBlock).
	const block = scoreFactoryBlock(map, tile, unit, cpuTeam, concealed)
	// Don't park a unit that can't capture on top of the thing we're trying to capture,
	// and don't sit on our own factory where it would block this turn's production.
	const squat =
		scoreObjectiveSquat(map, tile, unit, cpuTeam) + scoreSelfFactoryBlock(map, tile, cpuTeam)
	// Vacate a tile our own reinforcement is about to land on (a blocked drop is lost),
	// unless the positive terms above make holding worth the sacrifice.
	const reinforcement = scoreReinforcementTile(map, tile, cpuTeam)
	return (
		cover -
		threat +
		advance +
		defense +
		stealth -
		caution +
		hunt -
		phantom +
		explore +
		block -
		squat -
		overextend -
		reinforcement
	)
}

// The Warmachine is the player's life (Death.Insta_Lose) *and* their economy. The
// CPU never throws it at the front line — it scores the unit's positioning to keep
// it alive and productive: hug cover, flee any tile an enemy can hit, hold a buffer
// from the front, and when funds run low drift toward the nearest ore to refill.
// `wallet` is the unit's current holdings; `LOW_WALLET` is the threshold below
// which refuelling becomes a priority.
export const LOW_WALLET = 1000

export const scoreBuilderPosition = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number,
	wallet: number,
	concealed?: ReadonlySet<number>
): number => {
	const cover = terrainProtection(map, tile, unit) * unitValue(unit) * 0.05
	// Losing this unit loses the game, so weight incoming damage far above a normal
	// unit's threat term (×5) — a threatened tile is all but disqualifying.
	const danger =
		threatToTile(map, tile, unit, cpuTeam, concealed) * VALUE_PER_HP * unitValue(unit) * 5
	const enemyDist = closestEnemyDistance(map, tile, cpuTeam, concealed)
	// Inverse of a combat unit's "advance": reward keeping distance from the enemy.
	const safety = enemyDist > 0 ? Math.min(enemyDist, 8) * 2 : 0
	// Low on funds: pull toward the closest ore so it can mine and keep building.
	// The emptier the wallet the harder the pull, so a nearly broke Warmachine will
	// commit to closing on ore over hugging cover or padding its distance from the
	// enemy. It still never overrides `danger` (×5) — it won't walk onto a tile an
	// enemy can actually hit just to reach ore.
	const ore = closestOreDistance(map, tile)
	const urgency = wallet < LOW_WALLET ? (LOW_WALLET - wallet) / LOW_WALLET : 0
	const refuel = wallet < LOW_WALLET && ore > 0 ? -ore * (5 + urgency * 9) : 0
	return cover - danger + safety + refuel
}

// Mining always helps a builder, but it's urgent when the wallet is nearly empty —
// scale the reward from a baseline up as holdings fall below LOW_WALLET so a broke
// Warmachine prefers refilling over building the cheapest thing it can afford.
export const scoreBuilderMine = (wallet: number): number => {
	const urgency = wallet < LOW_WALLET ? (LOW_WALLET - wallet) / LOW_WALLET : 0
	return 80 + urgency * 180
}

// Value of a Warmachine spending its wallet to build a unit, from a given tile.
// `buildScore` is the chosen unit's production score (see bestBuildableType);
// `position` folds in how safe the tile it builds from is.
export const scoreBuilderBuild = (buildScore: number, position: number): number =>
	buildScore * 0.6 + position

// Below this many enemies on the board the Warmachine is willing to pick a fight —
// few foes means a lost trade can't snowball, and it hits hard enough to likely
// one-shot its target.
export const FEW_ENEMIES = 3

// A Warmachine attacking is the exception, not the rule: its life is the game, so
// escaping and building come first. But it's a heavy hitter, so when there are few
// enemies left and the shot is a clean, safe kill, taking it is a genuinely strong
// play — score that at full tactical value (plus the firing tile's safety). Any
// other attack (no kill, crowded board, or meaningful return fire) is a last
// resort: damped hard so build/mine/escape plans win unless nothing else remains.
export const scoreBuilderAttack = (
	attack: AttackScore,
	enemies: number,
	position: number
): number => {
	const cleanKill = attack.killsTarget && attack.returnDamage <= 0
	const favorable = cleanKill && enemies <= FEW_ENEMIES
	if (favorable) return attack.score + position * 0.5
	// Last resort: a fraction of the tactical value, anchored to how exposed the
	// firing tile is, so it only surfaces when build/escape are worse.
	return attack.score * 0.15 + position
}

export const scoreWait = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number,
	concealed?: ReadonlySet<number>,
	lurking: number = 0
): number => {
	return scorePositionBonus(map, tile, unit, cpuTeam, concealed, lurking) - 5
}
