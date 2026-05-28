// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { get } from 'svelte/store'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { buildingData } from '../../src/lib/GameData/building'
import { animateTeamDefeat, defeatAnimating } from '../../src/lib/Engine/defeat'

const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const unit = (type: number, team: number): UnitObject => ({
	type,
	state: 0,
	team,
	health: unitData[type].health,
})
const building = (type: number, team: number): BuildingObject =>
	({ type, state: 0, team }) as BuildingObject

const makeMap = (cols: number, rows: number): MapObject => ({
	cols,
	rows,
	layers: {
		ground: new Array(cols * rows).fill(0).map(() => ({ type: PLAINS, state: 0 })),
		sky: new Array(cols * rows).fill(null),
		units: new Array(cols * rows).fill(null),
		buildings: new Array(cols * rows).fill(null),
	},
	filters: { ground: () => [], sky: () => [], units: () => [], buildings: () => [] },
	route: new Array(cols * rows).fill(undefined),
	highlights: new Array(cols * rows).fill(undefined),
})

describe('animateTeamDefeat', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		defeatAnimating.set(0)
	})
	afterEach(() => vi.useRealTimers())

	it("clears the defeated team's units and buildings, leaving other teams alone", async () => {
		const map = makeMap(6, 6)
		map.layers.units[0] = unit(0, 0) // loser unit
		map.layers.units[5] = unit(0, 0) // loser unit
		map.layers.buildings[10] = building(0, 0) // loser building
		map.layers.units[35] = unit(0, 1) // survivor unit
		map.layers.buildings[34] = building(0, 1) // survivor building

		const done = animateTeamDefeat(map, 0)

		// Removal is synchronous (it happens before the explosion timers).
		expect(map.layers.units[0]).toBeNull()
		expect(map.layers.units[5]).toBeNull()
		expect(map.layers.buildings[10]).toBeNull()
		// The other team is untouched.
		expect(map.layers.units[35]).not.toBeNull()
		expect(map.layers.buildings[34]).not.toBeNull()
		// While blasts play, the results screen is held back.
		expect(get(defeatAnimating)).toBe(1)

		vi.runAllTimers()
		await done
		expect(get(defeatAnimating)).toBe(0)
	})

	it('a tile with both a unit and a building still resolves, and a team with nothing is a no-op', async () => {
		const map = makeMap(4, 4)
		map.layers.units[3] = unit(0, 0)
		map.layers.buildings[3] = building(0, 0) // unit standing on a building

		const done = animateTeamDefeat(map, 0)
		expect(map.layers.units[3]).toBeNull()
		expect(map.layers.buildings[3]).toBeNull()
		vi.runAllTimers()
		await done

		// No units/buildings for team 2 → nothing happens, no lingering animation flag.
		defeatAnimating.set(0)
		await animateTeamDefeat(map, 2)
		expect(get(defeatAnimating)).toBe(0)
	})
})
