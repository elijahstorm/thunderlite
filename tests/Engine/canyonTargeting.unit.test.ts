// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { generateAttackList } from '../../src/lib/Engine/Interactor/Pathing/attack'
import { unitThreatTiles } from '../../src/lib/Engine/Interactor/Pathing/threat'

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

const STRIKE_COMMANDO = unitIndex('Strike Commando') // direct, range [1,1]
const MORTAR_TRUCK = unitIndex('Mortar Truck') // indirect, range [2,3]
const PLAINS = terrainIndex('Plains')
const CANYON = terrainIndex('Canyon')

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

describe('Canyon (Trench) targeting', () => {
	it('is a sanity check that Canyon carries the Trench modifier', () => {
		expect(terrainData[CANYON].modifiers).toContain('Trench')
	})

	it('a long-range attacker cannot target an enemy sheltering in a Canyon', () => {
		const cols = 9
		const map = makeMap(cols, 9)
		const attackerTile = xy(cols, 4, 4)
		const targetTile = xy(cols, 4, 6) // 2 tiles away — inside Mortar's [2,3] range

		map.layers.units[attackerTile] = unit(MORTAR_TRUCK, 0)
		map.layers.units[targetTile] = unit(STRIKE_COMMANDO, 1)
		map.layers.ground[targetTile] = ground(CANYON)

		const targets = generateAttackList(map, attackerTile, map.layers.units[attackerTile]!)
		expect(targets).not.toContain(targetTile)
	})

	it('a long-range attacker CAN target the same enemy on open Plains', () => {
		const cols = 9
		const map = makeMap(cols, 9)
		const attackerTile = xy(cols, 4, 4)
		const targetTile = xy(cols, 4, 6)

		map.layers.units[attackerTile] = unit(MORTAR_TRUCK, 0)
		map.layers.units[targetTile] = unit(STRIKE_COMMANDO, 1)
		// target stays on Plains

		const targets = generateAttackList(map, attackerTile, map.layers.units[attackerTile]!)
		expect(targets).toContain(targetTile)
	})

	it('a direct attacker can still target an enemy in a Canyon', () => {
		const cols = 9
		const map = makeMap(cols, 9)
		const attackerTile = xy(cols, 4, 4)
		const targetTile = xy(cols, 4, 5) // adjacent — inside direct [1,1] range

		map.layers.units[attackerTile] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[targetTile] = unit(STRIKE_COMMANDO, 1)
		map.layers.ground[targetTile] = ground(CANYON)

		const targets = generateAttackList(map, attackerTile, map.layers.units[attackerTile]!)
		expect(targets).toContain(targetTile)
	})

	it('a Canyon tile is not flagged as threatened by a long-range unit', () => {
		const cols = 9
		const map = makeMap(cols, 9)
		const enemyTile = xy(cols, 4, 4)
		const canyonTile = xy(cols, 4, 6) // within [2,3] reach
		const plainsTile = xy(cols, 4, 7) // also within reach, stays open

		map.layers.units[enemyTile] = unit(MORTAR_TRUCK, 1)
		map.layers.ground[canyonTile] = ground(CANYON)

		const threat = unitThreatTiles(map, enemyTile, map.layers.units[enemyTile]!)
		expect(threat.has(canyonTile)).toBe(false)
		expect(threat.has(plainsTile)).toBe(true)
	})
})
