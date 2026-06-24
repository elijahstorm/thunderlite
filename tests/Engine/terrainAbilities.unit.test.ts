// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { generateAttackList } from '../../src/lib/Engine/Interactor/Pathing/attack'
import { unitThreatTiles } from '../../src/lib/Engine/Interactor/Pathing/threat'
import { validTerrain } from '../../src/lib/Engine/Interactor/Pathing/movement'
import { canShipOut } from '../../src/lib/Engine/modifiers/transport'

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

const MORTAR_TRUCK = unitIndex('Mortar Truck') // indirect, range [2,3]
const SCORPION_TANK = unitIndex('Scorpion Tank') // ground, direct
const CORVETTE = unitIndex('Corvette') // sea
const PLAINS = terrainIndex('Plains')
const HILLS = terrainIndex('Hills')
const SHORE = terrainIndex('Shore')
const BRIDGE = terrainIndex('Bridge')
const HIGH_BRIDGE = terrainIndex('High Bridge')

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

describe('Hills — high ground extends ranged reach', () => {
	it('a Mortar Truck on Hills can hit a target one tile beyond its base max range', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		const attackerTile = xy(cols, 5, 5)
		const farTile = xy(cols, 5, 9) // distance 4 — base max is 3, so only reachable with +1

		map.layers.units[attackerTile] = unit(MORTAR_TRUCK, 0)
		map.layers.units[farTile] = unit(SCORPION_TANK, 1)

		// On Plains: distance-4 target is out of [2,3] range.
		expect(generateAttackList(map, attackerTile, map.layers.units[attackerTile]!)).not.toContain(
			farTile
		)

		// On Hills: the +1 range bonus brings the distance-4 target into reach.
		map.layers.ground[attackerTile] = ground(HILLS)
		expect(generateAttackList(map, attackerTile, map.layers.units[attackerTile]!)).toContain(
			farTile
		)
	})

	it('the threat overlay reflects the extended reach from Hills', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		const enemyTile = xy(cols, 5, 5)
		const farTile = xy(cols, 5, 9) // distance 4

		map.layers.units[enemyTile] = unit(MORTAR_TRUCK, 1)
		map.layers.ground[enemyTile] = ground(HILLS)

		const threat = unitThreatTiles(map, enemyTile, map.layers.units[enemyTile]!)
		expect(threat.has(farTile)).toBe(true)
	})
})

describe('High Bridge — ships may pass; a plain Bridge blocks them', () => {
	it('allows both ground and sea units onto a High Bridge', () => {
		expect(validTerrain(ground(HIGH_BRIDGE), unit(SCORPION_TANK))).toBe(true)
		expect(validTerrain(ground(HIGH_BRIDGE), unit(CORVETTE))).toBe(true)
	})

	it('a plain Bridge carries ground units but blocks ships', () => {
		expect(validTerrain(ground(BRIDGE), unit(SCORPION_TANK))).toBe(true)
		expect(validTerrain(ground(BRIDGE), unit(CORVETTE))).toBe(false)
	})
})

describe('Port — embark trigger keys off the terrain modifier', () => {
	it('Shore carries the Port modifier', () => {
		expect(terrainData[SHORE].modifiers).toContain('Port')
	})

	it('a ground unit can ship out from a Port tile but not from a non-Port tile', () => {
		const cols = 5
		const map = makeMap(cols, 5)
		const tile = xy(cols, 2, 2)
		map.layers.units[tile] = unit(SCORPION_TANK, 0)

		map.layers.ground[tile] = ground(SHORE) // Port
		expect(canShipOut(map, tile)).toBe(true)

		map.layers.ground[tile] = ground(BRIDGE) // no Port, even though it touches water
		expect(canShipOut(map, tile)).toBe(false)
	})
})
