import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { coverProtection, previewDamage } from '../combat'
import { isMineableTerrainType } from '../modifiers/miner'
import { canAttackTarget } from '../modifiers/canAttack'
import {
	planningUnits,
	planningBuildings,
	planningConcealed,
	planningStationaryReach,
	planningThreatTiles,
} from './planningContext'
import { weights as W } from './weights'

// A loaded carrier (Transporter / Leviathan) is worth its own hull PLUS the unit
// inside it: the same accounting `matchTimeline.sampleTeams` shows the player, so the
// heuristics and the search's evaluator agree about what a carrier is. Without this
// every threat / cover / phantom term priced a Heavy Commando in the air at the
// Transporter's `cost: 0` → 50 fallback and happily flew it into fire.
export const unitValue = (unit: UnitObject): number => {
	const data = unitData[unit.type]
	if (!data) return 0
	const max = data.health || 1
	const hp = unit.health ?? max
	const cost = data.cost > 0 ? data.cost : 50
	const own = cost * (hp / max)
	return unit.rescuedUnit ? own + unitValue(unit.rescuedUnit) : own
}

// Cover as combat prices it (see coverProtection): ground/sea units read the
// terrain layer, air units read the sky layer — so the CPU hugs forests with
// tanks and cloud banks with aircraft, and never credits a mountain to a plane.
// Callers without a unit in hand get the plain ground reading.
export const terrainProtection = (map: MapObject, tile: number, unit?: UnitObject): number =>
	coverProtection(map, tile, (unit && unitData[unit.type]?.type) || 'ground')

export const buildingValue = (map: MapObject, tile: number, cpuTeam: number): number => {
	const building = map.layers.buildings[tile]
	if (!building) return 0
	const data = buildingData[building.type]
	if (!data) return 0
	if (building.team === cpuTeam) return 0

	let v = 0
	if (data.modifiers.includes('Capture.Insta_Lose')) v += W.INSTA_LOSE_VALUE
	if (data.modifiers.includes('Capture.Allow_Ground')) v += W.GROUND_CONTROL_VALUE
	if (data.modifiers.includes('Capture.Allow_Air')) v += W.AIR_CONTROL_VALUE
	if (data.modifiers.includes('Capture.Allow_Sea')) v += W.SEA_CONTROL_VALUE
	if (data.actable) v += W.FACTORY_VALUE
	v += data.income * W.INCOME_VALUE

	if (building.team === -1 || building.team === undefined || !isOwnedByLivingTeam(building)) {
		v *= W.NEUTRAL_BUILDING_FACTOR
	}
	return v
}

const isOwnedByLivingTeam = (building: BuildingObject): boolean => {
	return typeof building.team === 'number' && building.team >= 0
}

// `concealed` (tiles holding enemies the CPU can't perceive) is excluded from the
// threat sum: the AI plays blind, so a stealthed/fogged enemy contributes no fear.
// Defaults to recomputing it; the planner passes a shared set to avoid recomputing
// per candidate tile.
// `ignoreTile` drops one attacker from the tally — used when scoring an attack that
// *kills* its target: a dead unit can't shoot back next turn, so it shouldn't count
// toward the firing tile's post-attack danger.
export const threatToTile = (
	map: MapObject,
	tile: number,
	defender: UnitObject,
	cpuTeam: number,
	concealed: ReadonlySet<number> = planningConcealed(map, cpuTeam),
	ignoreTile?: number
): number => {
	let totalIncomingHP = 0
	const domain = unitData[defender.type]?.type ?? 'any'
	// Compact unit list + per-tick-cached enemy reach. The reach is stationary
	// GEOMETRY (the diamond from where the enemy stands), not its attack list: the
	// attack list only ever names tiles a target already occupies, so reading it here
	// made every empty destination look perfectly safe and the threat term only ever
	// bit on the tile a unit was already standing on.
	for (const { tile: i, unit: enemy } of planningUnits(map)) {
		if (i === ignoreTile) continue
		if (enemy.team === cpuTeam) continue
		if (concealed.has(i)) continue
		// A gun that can't be aimed at this kind of unit (no Air_Raid vs a plane, a
		// ship's deck gun vs infantry) is no threat to it however close it is.
		if (!canAttackTarget(enemy, defender)) continue
		if (!planningStationaryReach(map, i, enemy, domain).has(tile)) continue
		const dmg = previewDamage(enemy, defender, {
			map,
			defenderTile: tile,
			attackerTile: i,
			role: 'attack',
		})
		totalIncomingHP += dmg
	}
	return totalIncomingHP
}

// Total HP of incoming fire `unit` would suffer if it ended its turn on `tile`,
// counting every visible enemy that could strike it next turn — crucially including
// DIRECT attackers that move adjacent before firing (via `unitThreatTiles`), which the
// cheaper `threatToTile` above misses. Use this when the question is "can the enemy
// actually kill a unit parked here on their turn?", not just "who can shoot it from
// where they stand now". Concealed enemies (fog / stealth the CPU can't perceive) are
// skipped, like every other CPU threat term. Damage is forecast from each enemy's
// current tile — a slightly optimistic but conservative-enough stand-in for wherever
// it would move to fire.
export const incomingThreatMoveAware = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number,
	concealed: ReadonlySet<number> = planningConcealed(map, cpuTeam)
): number => {
	let total = 0
	const domain = unitData[unit.type]?.type ?? 'any'
	for (const { tile: i, unit: enemy } of planningUnits(map)) {
		if (enemy.team === cpuTeam) continue
		if (concealed.has(i)) continue
		if (!canAttackTarget(enemy, unit)) continue
		// Reach measured against THIS unit's domain — an air unit isn't sheltered by
		// the Trench/ridge geometry that would hide a ground unit on the same tile.
		if (!planningThreatTiles(map, i, enemy, domain).has(tile)) continue
		total += previewDamage(enemy, unit, {
			map,
			defenderTile: tile,
			attackerTile: i,
			role: 'attack',
		})
	}
	return total
}

// How many unit-producing (actable) buildings `team` owns. Used to value choking a
// team's production by parking a unit on its factory: blocking their *only* factory
// shuts production off entirely, while one of several barely dents their output.
export const factoryCount = (map: MapObject, team: number): number => {
	let n = 0
	for (const { building: b } of planningBuildings(map)) {
		if (b.team === team && buildingData[b.type]?.actable) n++
	}
	return n
}

export const enemyCount = (map: MapObject, cpuTeam: number): number => {
	let n = 0
	for (const { unit: u } of planningUnits(map)) {
		if (u.team !== cpuTeam) n++
	}
	return n
}

export const teamUnits = (map: MapObject, team: number): { tile: number; unit: UnitObject }[] =>
	planningUnits(map).filter(({ unit }) => unit.team === team)

// Concealed enemies are skipped — the CPU steers toward foes it can actually see,
// not ones cloaked by fog/stealth (whose positions it shouldn't know).
export const closestEnemyDistance = (
	map: MapObject,
	tile: number,
	cpuTeam: number,
	concealed: ReadonlySet<number> = planningConcealed(map, cpuTeam)
): number => {
	const col = tile % map.cols
	const row = Math.floor(tile / map.cols)
	let best = Infinity
	for (const { tile: i, unit: u } of planningUnits(map)) {
		if (u.team === cpuTeam) continue
		if (concealed.has(i)) continue
		const ec = i % map.cols
		const er = Math.floor(i / map.cols)
		const d = Math.abs(col - ec) + Math.abs(row - er)
		if (d < best) best = d
	}
	return best === Infinity ? 0 : best
}

// Manhattan distance to the nearest mineable ore tile (any tier), or 0 if the map
// has none left. Steers a low-on-funds Warmachine toward ore it can harvest to
// refill its wallet.
export const closestOreDistance = (map: MapObject, tile: number): number => {
	const col = tile % map.cols
	const row = Math.floor(tile / map.cols)
	let best = Infinity
	const ground = map.layers.ground
	for (let i = 0; i < ground.length; i++) {
		const g = ground[i]
		if (!g || !isMineableTerrainType(g.type)) continue
		const gc = i % map.cols
		const gr = Math.floor(i / map.cols)
		const d = Math.abs(col - gc) + Math.abs(row - gr)
		if (d < best) best = d
	}
	return best === Infinity ? 0 : best
}

export const closestObjectiveDistance = (map: MapObject, tile: number, cpuTeam: number): number => {
	const col = tile % map.cols
	const row = Math.floor(tile / map.cols)
	let best = Infinity
	for (const { tile: i, building: b } of planningBuildings(map)) {
		const data = buildingData[b.type]
		if (!data || data.stature <= 0) continue
		if (b.team === cpuTeam) continue
		const bc = i % map.cols
		const br = Math.floor(i / map.cols)
		const d = Math.abs(col - bc) + Math.abs(row - br)
		if (d < best) best = d
	}
	return best === Infinity ? 0 : best
}
