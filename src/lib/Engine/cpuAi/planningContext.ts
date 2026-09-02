import { concealedEnemyTiles } from '../visibility'
import { generateAttackList } from '../Interactor/Pathing/attack'
import { stationaryThreatTiles, unitThreatTiles } from '../Interactor/Pathing/threat'

// Per-tick memo cache for the CPU planner.
//
// While the CPU decides its next action (one `pickBestPlan` call) the board is
// frozen — nothing commits until after the plan is chosen — yet the scorer runs
// `scorePositionBonus` for every reachable tile of every actable unit, and each
// of those re-derived the same things from scratch:
//   • a compact list of units/buildings, by scanning the whole TILE-INDEXED
//     `layers.units` / `layers.buildings` array (length = cols×rows, so O(map)
//     even for a 10-unit board);
//   • each enemy's attack reach and move-aware threat reach;
//   • `concealedEnemyTiles` (itself an O(map) scan), recomputed inside every
//     `generateAttackList` call.
// Multiplied across candidates × units × ticks that was the CPU stall.
//
// This context is built once at the start of each tick (`beginCpuPlanning`) and
// torn down after (`endCpuPlanning`). Every accessor still works with no active
// context — it just computes fresh — so non-CPU callers (the interactor, overlays,
// the dev inspector) behave exactly as before. The cache only ever memoises pure
// reads of a static board, so results are identical to recomputing.

type UnitEntry = { tile: number; unit: UnitObject }
type BuildingEntry = { tile: number; building: BuildingObject }

type PlanningContext = {
	map: MapObject
	units: UnitEntry[] | null
	buildings: BuildingEntry[] | null
	concealed: Map<number, ReadonlySet<number>>
	attackReach: Map<number, number[]>
	stationaryReach: Map<string, Set<number>>
	threatTiles: Map<string, Set<number>>
	growth: Map<number, number>
	flock: Map<UnitObject, unknown>
}

let ctx: PlanningContext | null = null

export const beginCpuPlanning = (map: MapObject): void => {
	// Units/buildings/reach are all rebuilt lazily on first access this tick — a CPU
	// action committed last tick may have moved or killed a unit, so nothing carries
	// over. Only the reset happens here; the O(map) scans run at most once per tick.
	ctx = {
		map,
		units: null,
		buildings: null,
		concealed: new Map(),
		attackReach: new Map(),
		stationaryReach: new Map(),
		threatTiles: new Map(),
		growth: new Map(),
		flock: new Map(),
	}
}

export const endCpuPlanning = (): void => {
	ctx = null
}

const scanUnits = (map: MapObject): UnitEntry[] => {
	const out: UnitEntry[] = []
	const units = map.layers.units
	for (let i = 0; i < units.length; i++) {
		const unit = units[i]
		if (unit) out.push({ tile: i, unit })
	}
	return out
}

const scanBuildings = (map: MapObject): BuildingEntry[] => {
	const out: BuildingEntry[] = []
	const buildings = map.layers.buildings
	for (let i = 0; i < buildings.length; i++) {
		const building = buildings[i]
		if (building) out.push({ tile: i, building })
	}
	return out
}

const active = (map: MapObject): PlanningContext | null => (ctx && ctx.map === map ? ctx : null)

/** Compact list of every occupied unit tile — O(units), not O(map tiles). */
export const planningUnits = (map: MapObject): UnitEntry[] => {
	const c = active(map)
	if (c) return (c.units ??= scanUnits(map))
	return scanUnits(map)
}

/** Compact list of every building tile — O(buildings), not O(map tiles). */
export const planningBuildings = (map: MapObject): BuildingEntry[] => {
	const c = active(map)
	if (c) return (c.buildings ??= scanBuildings(map))
	return scanBuildings(map)
}

/** `concealedEnemyTiles(map, team)`, memoised per team for the current tick. */
export const planningConcealed = (map: MapObject, team: number): ReadonlySet<number> => {
	const c = active(map)
	if (!c) return concealedEnemyTiles(map, team)
	let set = c.concealed.get(team)
	if (!set) {
		set = concealedEnemyTiles(map, team)
		c.concealed.set(team, set)
	}
	return set
}

/**
 * `generateAttackList` for an enemy standing on `tile`, memoised by tile. Safe to
 * key on tile alone because the unit genuinely occupies it (this is only used for
 * real enemies at their current tile, never a hypothetical destination).
 */
export const planningAttackReach = (map: MapObject, tile: number, unit: UnitObject): number[] => {
	const c = active(map)
	if (!c) return generateAttackList(map, tile, unit, planningConcealed(map, unit.team))
	let reach = c.attackReach.get(tile)
	if (!reach) {
		reach = generateAttackList(map, tile, unit, planningConcealed(map, unit.team))
		c.attackReach.set(tile, reach)
	}
	return reach
}

/**
 * `stationaryThreatTiles` for an enemy on `tile`, memoised by tile + target domain:
 * the tiles it can hit next turn without moving. Geometry only, so it is valid for
 * empty tiles the planner is merely considering (the attack list above is not — it
 * only ever lists tiles a target already stands on).
 */
export const planningStationaryReach = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	targetDomain: 'any' | 'ground' | 'air' | 'sea' = 'any'
): Set<number> => {
	const c = active(map)
	if (!c) return stationaryThreatTiles(map, tile, unit, targetDomain)
	const key = `${tile}:${targetDomain}`
	let set = c.stationaryReach.get(key)
	if (!set) {
		set = stationaryThreatTiles(map, tile, unit, targetDomain)
		c.stationaryReach.set(key, set)
	}
	return set
}

/** `unitThreatTiles` for an enemy on `tile`, memoised by tile + target domain. */
export const planningThreatTiles = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	targetDomain: 'any' | 'ground' | 'air' | 'sea' = 'any'
): Set<number> => {
	const c = active(map)
	if (!c) return unitThreatTiles(map, tile, unit, targetDomain)
	const key = `${tile}:${targetDomain}`
	let set = c.threatTiles.get(key)
	if (!set) {
		set = unitThreatTiles(map, tile, unit, targetDomain)
		c.threatTiles.set(key, set)
	}
	return set
}

/**
 * Per-team scalar about the shape of the match (currently massing patience — see
 * growth.ts), memoised for the tick. Unlike the reach caches this one is derived
 * from the economy as well as the board, so it is keyed by team and computed by
 * the caller; the context only holds the result.
 */
export const planningGrowth = (map: MapObject, team: number, compute: () => number): number => {
	const c = active(map)
	if (!c) return compute()
	let value = c.growth.get(team)
	if (value === undefined) {
		value = compute()
		c.growth.set(team, value)
	}
	return value
}

/**
 * A per-mover value that is invariant across the candidate tiles being scored for it
 * — currently the flock anchor (score.ts), which depends on where the unit is *now*,
 * not on where it is thinking of going. Keyed by the unit object, which is stable for
 * the tick. Stored as `unknown` so this module stays free of scoring types; the single
 * caller owns the shape.
 */
export const planningFlock = <T>(map: MapObject, unit: UnitObject, compute: () => T): T => {
	const c = active(map)
	if (!c) return compute()
	if (c.flock.has(unit)) return c.flock.get(unit) as T
	const value = compute()
	c.flock.set(unit, value)
	return value
}
