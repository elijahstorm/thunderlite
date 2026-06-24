// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { heightTier, tileHeightTier } from '../../src/lib/Engine/modifiers/height'
import { calculateDamage } from '../../src/lib/Engine/combat'
import { computeTeamVisibility } from '../../src/lib/Engine/visibility'
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
const SCORPION = unitIndex('Scorpion Tank')
const SCOUT = unitIndex('Strike Commando') // sight 2
const ROCKET = unitIndex('Rocket Truck') // range [3,5]
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

describe('indirect-fire shadows', () => {
	// Rocket Truck at (0,0), enemy at (4,0). A mountain at (2,0) sits between them.
	const shadowMap = (betweenTerrain: number) => {
		const cols = 7
		const map = makeMap(cols, 1)
		map.layers.ground[xy(cols, 2, 0)] = ground(betweenTerrain)
		map.layers.units[xy(cols, 0, 0)] = unit(ROCKET, 0)
		map.layers.units[xy(cols, 4, 0)] = unit(SCORPION, 1)
		return { map, cols }
	}

	it('higher ground between firer and target blocks the shot', () => {
		const { map, cols } = shadowMap(MOUNTAIN)
		expect(generateAttackList(map, xy(cols, 0, 0), map.layers.units[xy(cols, 0, 0)]!)).not.toContain(
			xy(cols, 4, 0)
		)
	})

	it('a clear (level) line lets the shot through', () => {
		const { map, cols } = shadowMap(PLAINS)
		expect(generateAttackList(map, xy(cols, 0, 0), map.layers.units[xy(cols, 0, 0)]!)).toContain(
			xy(cols, 4, 0)
		)
	})

	it('the shadow appears in shadowedAttackTiles and is dropped from the threat overlay', () => {
		const { map, cols } = shadowMap(MOUNTAIN)
		const firer = map.layers.units[xy(cols, 0, 0)]!
		expect(shadowedAttackTiles(map, xy(cols, 0, 0), firer)).toContain(xy(cols, 4, 0))
		expect(unitThreatTiles(map, xy(cols, 0, 0), firer).has(xy(cols, 4, 0))).toBe(false)
	})
})
