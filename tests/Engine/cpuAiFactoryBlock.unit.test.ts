// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { scorePositionBonus } from '../../src/lib/Engine/cpuAi/score'
import { NEUTRAL_TEAM } from '../../src/lib/Engine/gameState'
import { unitData } from '../../src/lib/GameData/unit'

// The CPU should park a unit on an enemy's Warfactory to choke its production — but
// ONLY when the blocker can't be killed on the enemy's next turn, otherwise it gets
// shot off and the block accomplished nothing. We isolate the block bonus by scoring
// the SAME tile as an enemy Warfactory (actable) versus an enemy Oil Refinery
// (not actable): every positional term is identical, so the difference is purely the
// production-denial reward.

const STRIKE = 0 // Strike Commando — 40 HP, fragile blocker
const SCORPION = 3 // Scorpion Tank — shreds infantry
const WARFACTORY = 4 // actable (builds units)
const OIL = 6 // not actable
const CPU = 1
const ENEMY = 0

const COLS = 6
const ROWS = 6
const FACTORY = 2 + 2 * COLS // a central tile
const ADJACENT_E = 3 + 2 * COLS // immediately east of the factory
const ADJACENT_S = 2 + 3 * COLS // immediately south of the factory

const makeMap = (): MapObject =>
	({
		cols: COLS,
		rows: ROWS,
		layers: {
			ground: new Array(COLS * ROWS).fill(0).map(() => ({ type: 0, state: 0 })),
			sky: new Array(COLS * ROWS).fill(null),
			units: new Array(COLS * ROWS).fill(null),
			buildings: new Array(COLS * ROWS).fill(null),
		},
		highlights: [],
		route: [],
	}) as unknown as MapObject

const placeUnit = (map: MapObject, tile: number, type: number, team: number) => {
	map.layers.units[tile] = {
		type,
		state: 0,
		team,
		health: unitData[type].health,
	} as UnitObject
}

const placeBuilding = (map: MapObject, tile: number, type: number, team: number) => {
	map.layers.buildings[tile] = { type, team, state: 0 } as unknown as BuildingObject
}

const blocker = (): UnitObject =>
	({ type: STRIKE, state: 0, team: CPU, health: unitData[STRIKE].health }) as UnitObject

// Score ending on FACTORY for a given building type/owner and optional enemy layout.
const scoreOn = (buildingType: number, owner: number, withKiller: boolean): number => {
	const map = makeMap()
	placeBuilding(map, FACTORY, buildingType, owner)
	if (withKiller) {
		// Two adjacent Scorpions focus-firing overkill a 40-HP Strike Commando (each ~38),
		// so the blocker can't survive — the safety gate should refuse the block.
		placeUnit(map, ADJACENT_E, SCORPION, ENEMY)
		placeUnit(map, ADJACENT_S, SCORPION, ENEMY)
	}
	return scorePositionBonus(map, FACTORY, blocker(), CPU)
}

describe('CPU Warfactory blocking', () => {
	it('rewards parking on a safe enemy factory over an identical non-factory building', () => {
		const onFactory = scoreOn(WARFACTORY, ENEMY, false)
		const onOil = scoreOn(OIL, ENEMY, false)
		expect(onFactory).toBeGreaterThan(onOil)
	})

	it('does NOT reward the block when the enemy can kill the blocker that turn', () => {
		// A lethal threat is shared by both maps, so any positional/threat terms cancel —
		// what remains must be zero, proving the block bonus is gated off when unsafe.
		const onFactory = scoreOn(WARFACTORY, ENEMY, true)
		const onOil = scoreOn(OIL, ENEMY, true)
		// Sanity: the adjacent Scorpion really would kill a 40-HP Strike Commando.
		expect(unitData[STRIKE].health).toBeLessThanOrEqual(40)
		expect(onFactory).toBeCloseTo(onOil, 5)
	})

	it('does not reward blocking a neutral (unclaimed) factory', () => {
		const onFactory = scoreOn(WARFACTORY, NEUTRAL_TEAM, false)
		const onOil = scoreOn(OIL, NEUTRAL_TEAM, false)
		expect(onFactory).toBeCloseTo(onOil, 5)
	})

	it("does not reward sitting on the CPU's own factory", () => {
		const onFactory = scoreOn(WARFACTORY, CPU, false)
		const onOil = scoreOn(OIL, CPU, false)
		expect(onFactory).toBeCloseTo(onOil, 5)
	})
})
