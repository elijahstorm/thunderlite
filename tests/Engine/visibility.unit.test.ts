// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeTeamVisibility, computeUnitSight } from '../../src/lib/Engine/visibility'
import { terrainData } from '../../src/lib/GameData/terrain'
import { unitData } from '../../src/lib/GameData/unit'

const terrainIndex = (name: string) => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`unknown terrain: ${name}`)
	return idx
}

const unitIndex = (name: string) => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`unknown unit: ${name}`)
	return idx
}

const PLAINS = terrainIndex('Plains')
const HILLS = terrainIndex('Hills')
const MOUNTAIN = terrainIndex('Mountain')

const STRIKE_COMMANDO = unitIndex('Strike Commando') // sight 2, range [1,1] (non-ranged)
const ROCKET_TRUCK = unitIndex('Rocket Truck') // sight 4, range [3,5] (ranged)

const ground = (type: number): GroundObject => ({ type, state: 0 })
const unit = (type: number, team = 0): UnitObject => ({ type, state: 0, team })

const makeMap = (cols: number, rows: number, groundType: number = PLAINS): MapProcesser => ({
	cols,
	rows,
	layers: {
		ground: new Array(cols * rows).fill(0).map(() => ground(groundType)),
		sky: new Array(cols * rows).fill(null),
		units: new Array(cols * rows).fill(null),
		buildings: new Array(cols * rows).fill(null),
	},
})

describe('computeUnitSight', () => {
	it('returns the unit base sight on plains', () => {
		const map = makeMap(5, 5, PLAINS)
		const u = unit(STRIKE_COMMANDO)
		expect(computeUnitSight(map, 12, u)).toBe(unitData[STRIKE_COMMANDO].sight)
	})

	it('adds +1 sight to a non-ranged unit standing on Hills', () => {
		const map = makeMap(5, 5, PLAINS)
		map.layers.ground[12] = ground(HILLS)
		const u = unit(STRIKE_COMMANDO)
		expect(computeUnitSight(map, 12, u)).toBe(unitData[STRIKE_COMMANDO].sight + 1)
	})

	it('adds +2 sight to a non-ranged unit standing on a Mountain', () => {
		const map = makeMap(5, 5, PLAINS)
		map.layers.ground[12] = ground(MOUNTAIN)
		const u = unit(STRIKE_COMMANDO)
		expect(computeUnitSight(map, 12, u)).toBe(unitData[STRIKE_COMMANDO].sight + 2)
	})

	it('grants the sight bonus by height tier regardless of unit kind (+1 Hills, +2 Mountain)', () => {
		const map = makeMap(5, 5, PLAINS)
		map.layers.ground[12] = ground(HILLS)
		const u = unit(ROCKET_TRUCK)
		expect(computeUnitSight(map, 12, u)).toBe(unitData[ROCKET_TRUCK].sight + 1)
		map.layers.ground[12] = ground(MOUNTAIN)
		expect(computeUnitSight(map, 12, u)).toBe(unitData[ROCKET_TRUCK].sight + 2)
	})

	it('drops the bonus when the unit moves off Extra_Sight terrain', () => {
		const map = makeMap(5, 5, PLAINS)
		map.layers.ground[12] = ground(HILLS)
		const u = unit(STRIKE_COMMANDO)
		expect(computeUnitSight(map, 12, u)).toBe(unitData[STRIKE_COMMANDO].sight + 1)
		expect(computeUnitSight(map, 6, u)).toBe(unitData[STRIKE_COMMANDO].sight)
	})
})

describe('computeTeamVisibility', () => {
	it('returns an empty set if the team has no units', () => {
		const map = makeMap(5, 5)
		expect(computeTeamVisibility(map, 0)).toEqual(new Set())
	})

	it('covers a Manhattan diamond around the unit equal to its sight radius', () => {
		const map = makeMap(7, 7)
		const center = 3 * 7 + 3
		map.layers.units[center] = unit(STRIKE_COMMANDO, 0)
		const visible = computeTeamVisibility(map, 0)

		const sight = unitData[STRIKE_COMMANDO].sight
		const expected = new Set<number>()
		for (let dy = -sight; dy <= sight; dy++) {
			const rem = sight - Math.abs(dy)
			for (let dx = -rem; dx <= rem; dx++) {
				expected.add((3 + dy) * 7 + (3 + dx))
			}
		}
		expect(visible).toEqual(expected)
	})

	it('unions the diamonds of all owned units', () => {
		const map = makeMap(7, 7)
		map.layers.units[0] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[6 * 7 + 6] = unit(STRIKE_COMMANDO, 0)
		const visible = computeTeamVisibility(map, 0)
		expect(visible.has(0)).toBe(true)
		expect(visible.has(6 * 7 + 6)).toBe(true)
		expect(visible.has(3 * 7 + 3)).toBe(false)
	})

	it('only counts units belonging to the requested team', () => {
		const map = makeMap(7, 7)
		const myTile = 3 * 7 + 3
		const enemyTile = 6 * 7 + 6
		map.layers.units[myTile] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[enemyTile] = unit(STRIKE_COMMANDO, 1)

		const mine = computeTeamVisibility(map, 0)
		expect(mine.has(myTile)).toBe(true)
		expect(mine.has(enemyTile)).toBe(false)

		const theirs = computeTeamVisibility(map, 1)
		expect(theirs.has(enemyTile)).toBe(true)
		expect(theirs.has(myTile)).toBe(false)
	})

	it('grows the visibility set when a unit stands on Hills (+1 for non-ranged)', () => {
		const baseMap = makeMap(9, 9)
		const center = 4 * 9 + 4
		baseMap.layers.units[center] = unit(STRIKE_COMMANDO, 0)
		const without = computeTeamVisibility(baseMap, 0)

		const withHills = makeMap(9, 9)
		withHills.layers.ground[center] = ground(HILLS)
		withHills.layers.units[center] = unit(STRIKE_COMMANDO, 0)
		const enlarged = computeTeamVisibility(withHills, 0)

		expect(enlarged.size).toBeGreaterThan(without.size)
		const sight = unitData[STRIKE_COMMANDO].sight + 1
		const farTile = (4 + sight) * 9 + 4
		expect(enlarged.has(farTile)).toBe(true)
		expect(without.has(farTile)).toBe(false)
	})

	it('clips to the map edges', () => {
		const map = makeMap(3, 3)
		map.layers.units[0] = unit(STRIKE_COMMANDO, 0)
		const visible = computeTeamVisibility(map, 0)
		for (const tile of visible) {
			const x = tile % 3
			const y = Math.floor(tile / 3)
			expect(x).toBeGreaterThanOrEqual(0)
			expect(x).toBeLessThan(3)
			expect(y).toBeGreaterThanOrEqual(0)
			expect(y).toBeLessThan(3)
		}
		expect(visible.has(0)).toBe(true)
	})
})
