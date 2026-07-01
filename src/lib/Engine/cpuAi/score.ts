import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { previewDamage, canCounterAttack } from '../combat'
import { isStealthUnit, hasRadarField } from '../visibility'
import { hasAdjacentEnemy, adjacentTiles } from '../modifiers/cloak'
import { hasModifier } from '../modifiers/canAttack'
import { computeBehindTile } from '../modifiers/lance'
import { tilesInRange } from '../modifiers/radar'
import { strongestSuspicion } from './stealthMemory'
import { phantomThreatAt, exploreValue } from './fogMemory'
import { NEUTRAL_TEAM } from '../gameState'
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
	const vv = unitValue(victim)
	const value = kills ? vv + LANCE_KILL_BONUS : damage * VALUE_PER_HP * vv

	// Same team behind the target → friendly fire: dock the score by the same
	// amount the hit would have been worth against an enemy.
	return victim.team === attacker.team ? -value : value
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

	const tv = unitValue(defender)
	const av = unitValue(attacker)
	const damageValueOut = killsTarget ? tv : damage * VALUE_PER_HP * tv
	const damageValueIn = returnDamage * VALUE_PER_HP * av

	let score = damageValueOut - damageValueIn
	if (killsTarget) score += 25
	if (killsTarget && !defStats) score = 0

	// Fold in unit-specific attack quirks: a Lance Tank's passthrough hit on the
	// tile behind the target (bonus for an enemy, penalty for a friendly), and a
	// Vulture Drone's free follow-up action when the shot kills.
	score += scoreLancePassthrough(map, attacker, attackerTile, defenderTile)
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
	const buildings = map.layers.buildings
	const units = map.layers.units
	let best = 0
	for (let i = 0; i < buildings.length; i++) {
		const b = buildings[i]
		if (!b || b.team !== cpuTeam) continue
		const data = buildingData[b.type]
		if (!data) continue
		const insta = data.modifiers.includes('Capture.Insta_Lose')
		const importance = insta ? 4000 : (data.actable ? 500 : 0) + data.income * 2
		if (importance <= 0) continue
		// Nearest enemy that can actually capture this building.
		let de = Infinity
		for (let j = 0; j < units.length; j++) {
			const e = units[j]
			if (!e || e.team === cpuTeam) continue
			if (!hasModifier(e, 'Start_Turn.Capture')) continue
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
	const cover = terrainProtection(map, tile) * unitValue(unit) * 0.05
	const threat = expectedLossAt(map, tile, unit, cpuTeam, concealed, ignoreThreatTile)
	const objectiveDist = closestObjectiveDistance(map, tile, cpuTeam)
	const enemyDist = closestEnemyDistance(map, tile, cpuTeam, concealed)
	// Capture-capable units feel the objective pull harder — they're the only ones who
	// can actually take a building — so they press in instead of milling at the front.
	const objWeight = hasModifier(unit, 'Start_Turn.Capture') ? 3 : 1.5
	// Ranged units (min range ≥ 2, and never capture-capable here) seek standoff instead
	// of charging: hold the enemy at firing distance rather than closing onto the front.
	const [minRange, maxRange] = unitData[unit.type]?.range ?? [0, 0]
	const advance =
		minRange >= 2
			? rangedStandoff(enemyDist, minRange, maxRange)
			: objectiveDist > 0
				? -objectiveDist * objWeight
				: -enemyDist * 0.5
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
	return cover - threat + advance + defense + stealth - caution + hunt - phantom + explore + block
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
	const cover = terrainProtection(map, tile) * unitValue(unit) * 0.05
	// Losing this unit loses the game, so weight incoming damage far above a normal
	// unit's threat term (×5) — a threatened tile is all but disqualifying.
	const danger = threatToTile(map, tile, unit, cpuTeam, concealed) * VALUE_PER_HP * unitValue(unit) * 5
	const enemyDist = closestEnemyDistance(map, tile, cpuTeam, concealed)
	// Inverse of a combat unit's "advance": reward keeping distance from the enemy.
	const safety = enemyDist > 0 ? Math.min(enemyDist, 8) * 2 : 0
	// Low on funds: pull toward the closest ore so it can mine and keep building.
	const ore = closestOreDistance(map, tile)
	const refuel = wallet < LOW_WALLET && ore > 0 ? -ore * 2 : 0
	return cover - danger + safety + refuel
}

// Mining always helps a builder, but it's urgent when the wallet is nearly empty —
// scale the reward from a baseline up as holdings fall below LOW_WALLET so a broke
// Warmachine prefers refilling over building the cheapest thing it can afford.
export const scoreBuilderMine = (wallet: number): number => {
	const urgency = wallet < LOW_WALLET ? (LOW_WALLET - wallet) / LOW_WALLET : 0
	return 60 + urgency * 140
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
