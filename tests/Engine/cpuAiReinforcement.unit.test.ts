// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { scorePositionBonus } from '../../src/lib/Engine/cpuAi/score'
import { unitData } from '../../src/lib/GameData/unit'

// A scripted reinforcement telegraphed onto a tile is forfeited if the CPU's own
// unit is still parked there when it lands. So the scorer should DOCK ending on a
// reserved tile by the incoming unit's value (× REINFORCEMENT_WEIGHT = 0.5), which
// nudges the CPU to vacate — while leaving the trade winnable by a strong action.
// We isolate the term by scoring the same tile/unit with and without the telegraph:
// every other positional factor is identical, so the delta is purely the penalty.

const STRIKE = unitData.findIndex((u) => u.name === 'Strike Commando')
const SCORPION = unitData.findIndex((u) => u.name === 'Scorpion Tank')
const CPU = 1
const ENEMY = 0

const COLS = 6
const ROWS = 6
const SPOT = 2 + 2 * COLS // a quiet central tile, well away from any enemy

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

const mover = (): UnitObject =>
	({ type: SCORPION, state: 0, team: CPU, health: unitData[SCORPION].health }) as UnitObject

describe('CPU reinforcement-tile weighting', () => {
	it('penalises ending on a tile reserved for the CPU own reinforcement', () => {
		const bare = makeMap()
		const baseline = scorePositionBonus(bare, SPOT, mover(), CPU)

		const reserved = makeMap()
		reserved.scheduledSpawns = [
			{ tile: SPOT, team: CPU, unitType: STRIKE, unitName: 'Strike Commando' },
		]
		const withReservation = scorePositionBonus(reserved, SPOT, mover(), CPU)

		const expectedPenalty = unitData[STRIKE].cost * 0.5
		expect(baseline - withReservation).toBeCloseTo(expectedPenalty, 5)
		expect(withReservation).toBeLessThan(baseline)
	})

	it("does not penalise a tile reserved for a DIFFERENT team's reinforcement", () => {
		const bare = makeMap()
		const baseline = scorePositionBonus(bare, SPOT, mover(), CPU)

		const enemyReserved = makeMap()
		enemyReserved.scheduledSpawns = [
			{ tile: SPOT, team: ENEMY, unitType: STRIKE, unitName: 'Strike Commando' },
		]
		expect(scorePositionBonus(enemyReserved, SPOT, mover(), CPU)).toBeCloseTo(baseline, 5)
	})

	it('leaves tiles with no telegraph unchanged', () => {
		const map = makeMap()
		map.scheduledSpawns = [
			{ tile: SPOT + 1, team: CPU, unitType: STRIKE, unitName: 'Strike Commando' },
		]
		const bare = makeMap()
		expect(scorePositionBonus(map, SPOT, mover(), CPU)).toBeCloseTo(
			scorePositionBonus(bare, SPOT, mover(), CPU),
			5
		)
	})
})
