// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { scoreAttack } from '../../src/lib/Engine/cpuAi/score'
import { unitData } from '../../src/lib/GameData/unit'

// The CPU should weigh a unit's special attack quirks when scoring a shot:
//  - Lance Tank (type 4): its hit passes through to the tile *behind* the target,
//    so it should favor shots that line up a second enemy and shun ones that gore
//    a friendly standing behind.
//  - Vulture Drone (type 18): a kill frees it to act again, so a lethal shot is
//    worth more to it than mere chip damage.

const LANCE = 4
const VULTURE = 18
const GRUNT = 0 // Strike Commando — cheap, fragile, generic target

const COLS = 6
const ROWS = 6

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

const place = (map: MapObject, tile: number, type: number, team: number, health?: number) => {
	const unit = {
		type,
		state: 0,
		team,
		health: health ?? unitData[type].health,
	} as UnitObject
	map.layers.units[tile] = unit
	return unit
}

describe('Lance Tank passthrough awareness', () => {
	// Attacker at col 1, target at col 2, behind tile at col 3 — all on the same row.
	const ATTACKER = 1 + 2 * COLS
	const TARGET = 2 + 2 * COLS
	const BEHIND = 3 + 2 * COLS

	it('rewards a shot that catches a second enemy behind the target', () => {
		const baseMap = makeMap()
		const attacker = place(baseMap, ATTACKER, LANCE, 1)
		const target = place(baseMap, TARGET, GRUNT, 0)
		const baseline = scoreAttack(baseMap, attacker, ATTACKER, target, TARGET).score

		const lineMap = makeMap()
		const attacker2 = place(lineMap, ATTACKER, LANCE, 1)
		const target2 = place(lineMap, TARGET, GRUNT, 0)
		place(lineMap, BEHIND, GRUNT, 0) // enemy lined up behind
		const lined = scoreAttack(lineMap, attacker2, ATTACKER, target2, TARGET).score

		expect(lined).toBeGreaterThan(baseline)
	})

	it('penalizes a shot that would gore a friendly unit behind the target', () => {
		const baseMap = makeMap()
		const attacker = place(baseMap, ATTACKER, LANCE, 1)
		const target = place(baseMap, TARGET, GRUNT, 0)
		const baseline = scoreAttack(baseMap, attacker, ATTACKER, target, TARGET).score

		const ffMap = makeMap()
		const attacker2 = place(ffMap, ATTACKER, LANCE, 1)
		const target2 = place(ffMap, TARGET, GRUNT, 0)
		place(ffMap, BEHIND, GRUNT, 1) // own unit behind — friendly fire
		const friendlyFire = scoreAttack(ffMap, attacker2, ATTACKER, target2, TARGET).score

		expect(friendlyFire).toBeLessThan(baseline)
	})

	it('does not change scoring for a non-lance unit with a unit behind', () => {
		const baseMap = makeMap()
		const attacker = place(baseMap, ATTACKER, GRUNT, 1)
		const target = place(baseMap, TARGET, GRUNT, 0)
		const baseline = scoreAttack(baseMap, attacker, ATTACKER, target, TARGET).score

		const lineMap = makeMap()
		const attacker2 = place(lineMap, ATTACKER, GRUNT, 1)
		const target2 = place(lineMap, TARGET, GRUNT, 0)
		place(lineMap, BEHIND, GRUNT, 0)
		const lined = scoreAttack(lineMap, attacker2, ATTACKER, target2, TARGET).score

		expect(lined).toBe(baseline)
	})
})

describe('Vulture Drone kill awareness', () => {
	const ATTACKER = 10
	const TARGET = 11

	it('values a lethal shot above a non-lethal one beyond the base kill bonus', () => {
		// A Vulture that secures a kill vs. one that merely chips: the kill should
		// carry the extra free-action bonus on top of the normal kill reward.
		const killMap = makeMap()
		const vulture = place(killMap, ATTACKER, VULTURE, 1)
		const frail = place(killMap, TARGET, GRUNT, 0, 1) // 1 HP — guaranteed kill
		const killScore = scoreAttack(killMap, vulture, ATTACKER, frail, TARGET)
		expect(killScore.killsTarget).toBe(true)

		// Compare the same kill scored as if the attacker were a generic unit by
		// checking the Vulture beats a non-Vulture making the identical kill.
		const plainMap = makeMap()
		const plain = place(plainMap, ATTACKER, GRUNT, 1)
		const frail2 = place(plainMap, TARGET, GRUNT, 0, 1)
		const plainScore = scoreAttack(plainMap, plain, ATTACKER, frail2, TARGET)
		expect(plainScore.killsTarget).toBe(true)

		expect(killScore.score).toBeGreaterThan(plainScore.score)
	})
})
