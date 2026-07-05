// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { heightTier, tileHeightTier } from '../../src/lib/Engine/modifiers/height'
import { calculateDamage } from '../../src/lib/Engine/combat'
import { computeTeamVisibility, computeUnitSight } from '../../src/lib/Engine/visibility'
import { extraRangeBonus } from '../../src/lib/Engine/modifiers/extraSight'
import { generateAttackList, shadowedAttackTiles } from '../../src/lib/Engine/Interactor/Pathing/attack'
import { unitThreatTiles } from '../../src/lib/Engine/Interactor/Pathing/threat'
import { occlusionMode } from '../../src/lib/Engine/occlusionState'

const unitIndex = (name: string) => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`unknown unit: ${name}`)
	return idx
}
const terrainIndex = (name: string) => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`unknown terrain: ${name}`)
	return idx
}

const PLAINS = terrainIndex('Plains')
const HILLS = terrainIndex('Hills')
const MOUNTAIN = terrainIndex('Mountain')
const CANYON = terrainIndex('Canyon')
const RAMPART = terrainIndex('Rampart')
const SCORPION = unitIndex('Scorpion Tank')
const SCOUT = unitIndex('Strike Commando') // sight 2
const ROCKET = unitIndex('Rocket Truck') // range [3,5]
const SHRIKE = unitIndex('Shrike Interdictor') // air, range [2,4] (ranged)
const AIR = unitData.findIndex((u) => u.type === 'air')

const ground = (type: number): GroundObject => ({ type, state: 0 })
const unit = (type: number, team = 0): UnitObject => ({
	type,
	state: 0,
	team,
	health: unitData[type].health,
})

const makeMap = (cols: number, rows: number): MapObject => ({
	cols,
	rows,
	layers: {
		ground: new Array(cols * rows).fill(0).map(() => ground(PLAINS)),
		sky: new Array(cols * rows).fill(null),
		units: new Array(cols * rows).fill(null),
		buildings: new Array(cols * rows).fill(null),
	},
	filters: { ground: () => [], sky: () => [], units: () => [], buildings: () => [] },
	route: new Array(cols * rows).fill(undefined),
	highlights: new Array(cols * rows).fill(undefined),
})

const xy = (cols: number, x: number, y: number) => y * cols + x

afterEach(() => {
	occlusionMode.set('off')
})

describe('height tiers', () => {
	it('maps raw terrain height to floor(height / 20)', () => {
		expect(heightTier(0)).toBe(0)
		expect(heightTier(5)).toBe(0) // Forest
		expect(heightTier(20)).toBe(1) // Hills
		expect(heightTier(50)).toBe(2) // Mountain
		expect(heightTier(-10)).toBe(-1) // Canyon dips below
	})

	it('reads a tile’s tier from the terrain table', () => {
		const map = makeMap(3, 3)
		map.layers.ground[4] = ground(MOUNTAIN)
		expect(tileHeightTier(map, 4)).toBe(2)
		map.layers.ground[4] = ground(CANYON)
		expect(tileHeightTier(map, 4)).toBe(-1)
	})
})

describe('high-ground combat bonus (offense-only downhill)', () => {
	const dmgFrom = (attackerTerrain: number, defenderTerrain: number, withTile = true): number => {
		const cols = 3
		const map = makeMap(cols, 1)
		const at = xy(cols, 0, 0)
		const dt = xy(cols, 1, 0)
		map.layers.ground[at] = ground(attackerTerrain)
		map.layers.ground[dt] = ground(defenderTerrain)
		const attacker = unit(SCORPION, 0)
		const defender = unit(SCORPION, 1)
		map.layers.units[at] = attacker
		map.layers.units[dt] = defender
		return calculateDamage(attacker, defender, {
			map,
			defenderTile: dt,
			attackerTile: withTile ? at : undefined,
			role: 'attack',
		})
	}

	it('rewards firing downhill, scaling with tier advantage', () => {
		const level = dmgFrom(PLAINS, PLAINS)
		const hills = dmgFrom(HILLS, PLAINS)
		const mountain = dmgFrom(MOUNTAIN, PLAINS)
		expect(hills).toBeGreaterThanOrEqual(level)
		expect(mountain).toBeGreaterThan(level)
		expect(mountain).toBeGreaterThanOrEqual(hills)
	})

	it('gives no bonus firing uphill or on the level (protection already covers defense)', () => {
		const level = dmgFrom(PLAINS, PLAINS)
		const uphill = dmgFrom(CANYON, PLAINS) // attacker lower than defender
		expect(uphill).toBe(level)
	})

	it('is skipped entirely when the attacker tile is not supplied', () => {
		expect(dmgFrom(MOUNTAIN, PLAINS, false)).toBe(dmgFrom(PLAINS, PLAINS))
	})
})

describe('air units ignore terrain elevation perks', () => {
	it('a vantage tile (Mountain) lifts a ground unit’s sight but not an air unit’s', () => {
		const map = makeMap(3, 3)
		map.layers.ground[4] = ground(MOUNTAIN)

		const groundSight = computeUnitSight(map, 4, unit(SCOUT))
		const airSight = computeUnitSight(map, 4, unit(AIR))

		// Ground unit gains the Mountain's tier-2 Extra_Sight bonus over its base 2.
		expect(groundSight).toBe((unitData[SCOUT].sight ?? 0) + 2)
		// Air unit flies at its own altitude — the peak beneath adds nothing.
		expect(airSight).toBe(unitData[AIR].sight ?? 0)
	})

	it('lifts a ranged GROUND unit’s arc on high ground but never a ranged AIR unit’s', () => {
		const map = makeMap(3, 3)
		map.layers.ground[4] = ground(HILLS)
		// The Shrike Interdictor is genuinely long-ranged (range [2,4]), so this
		// exercises the air guard where it matters — isRanged is true, yet the Hills
		// grant it nothing because it flies at its own altitude.
		expect(extraRangeBonus(map, 4, unit(ROCKET))).toBe(1) // ranged ground: +1 tile
		expect(extraRangeBonus(map, 4, unit(SHRIKE))).toBe(0) // ranged air: no lift
	})
})

describe('fog occlusion models', () => {
	// viewer at (0,0), a Mountain at (1,0), an open target tile at (2,0).
	const lineMap = (viewerTerrain: number) => {
		const cols = 5
		const map = makeMap(cols, 1)
		map.layers.ground[xy(cols, 0, 0)] = ground(viewerTerrain)
		map.layers.ground[xy(cols, 1, 0)] = ground(MOUNTAIN)
		map.layers.units[xy(cols, 0, 0)] = unit(SCOUT, 0)
		return { map, cols }
	}

	it('off: classic diamond ignores terrain (the tile behind a mountain is seen)', () => {
		occlusionMode.set('off')
		const { map, cols } = lineMap(PLAINS)
		expect(computeTeamVisibility(map, 0).has(xy(cols, 2, 0))).toBe(true)
	})

	it('viewer-relative: a low viewer can’t see past a taller mountain', () => {
		occlusionMode.set('viewer-relative')
		const { map, cols } = lineMap(PLAINS)
		expect(computeTeamVisibility(map, 0).has(xy(cols, 2, 0))).toBe(false)
	})

	it('viewer-relative: standing on equal high ground sees over it', () => {
		occlusionMode.set('viewer-relative')
		const { map, cols } = lineMap(MOUNTAIN) // viewer also tier 2
		expect(computeTeamVisibility(map, 0).has(xy(cols, 2, 0))).toBe(true)
	})

	it('raycast: a mountain occludes a low-eye sightline', () => {
		occlusionMode.set('raycast')
		const { map, cols } = lineMap(PLAINS)
		expect(computeTeamVisibility(map, 0).has(xy(cols, 2, 0))).toBe(false)
	})

	it('airborne viewers ignore occlusion entirely', () => {
		if (AIR < 0) return
		const cols = 5
		const map = makeMap(cols, 1)
		map.layers.ground[xy(cols, 1, 0)] = ground(MOUNTAIN)
		map.layers.units[xy(cols, 0, 0)] = unit(AIR, 0)

		occlusionMode.set('off')
		const open = computeTeamVisibility(map, 0)
		occlusionMode.set('viewer-relative')
		const occluded = computeTeamVisibility(map, 0)
		expect(occluded).toEqual(open)
	})
})

describe('indirect-fire blocking (Rampart / Bulwark)', () => {
	// Rocket Truck at (0,0), enemy at (4,0). Something sits at (2,0) between them.
	const shadowMap = (betweenTerrain: number) => {
		const cols = 7
		const map = makeMap(cols, 1)
		map.layers.ground[xy(cols, 2, 0)] = ground(betweenTerrain)
		map.layers.units[xy(cols, 0, 0)] = unit(ROCKET, 0)
		map.layers.units[xy(cols, 4, 0)] = unit(SCORPION, 1)
		return { map, cols }
	}

	it('a Rampart between firer and target blocks the shot', () => {
		const { map, cols } = shadowMap(RAMPART)
		expect(generateAttackList(map, xy(cols, 0, 0), map.layers.units[xy(cols, 0, 0)]!)).not.toContain(
			xy(cols, 4, 0)
		)
	})

	it('height alone no longer blocks fire: a mountain between lets the shot through', () => {
		const { map, cols } = shadowMap(MOUNTAIN)
		expect(generateAttackList(map, xy(cols, 0, 0), map.layers.units[xy(cols, 0, 0)]!)).toContain(
			xy(cols, 4, 0)
		)
	})

	it('a clear (level) line lets the shot through', () => {
		const { map, cols } = shadowMap(PLAINS)
		expect(generateAttackList(map, xy(cols, 0, 0), map.layers.units[xy(cols, 0, 0)]!)).toContain(
			xy(cols, 4, 0)
		)
	})

	it('the blocked tile appears in shadowedAttackTiles and is dropped from the threat overlay', () => {
		const { map, cols } = shadowMap(RAMPART)
		const firer = map.layers.units[xy(cols, 0, 0)]!
		expect(shadowedAttackTiles(map, xy(cols, 0, 0), firer)).toContain(xy(cols, 4, 0))
		expect(unitThreatTiles(map, xy(cols, 0, 0), firer).has(xy(cols, 4, 0))).toBe(false)
	})
})
