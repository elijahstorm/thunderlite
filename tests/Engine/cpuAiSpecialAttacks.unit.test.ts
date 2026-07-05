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

	it('ignores a behind unit the lance cannot target (air unit is overflown)', () => {
		// The commit misses an air unit behind the target (applyLancePassthrough
		// gates on canAttackTarget), so it must add no value — and a FRIENDLY air
		// unit behind must cost no friendly-fire penalty either.
		const RAPTOR = unitData.findIndex((u) => u.name === 'Raptor Fighter')
		const baseMap = makeMap()
		const attacker = place(baseMap, ATTACKER, LANCE, 1)
		const target = place(baseMap, TARGET, GRUNT, 0)
		const baseline = scoreAttack(baseMap, attacker, ATTACKER, target, TARGET).score

		const enemyAirMap = makeMap()
		const attacker2 = place(enemyAirMap, ATTACKER, LANCE, 1)
		const target2 = place(enemyAirMap, TARGET, GRUNT, 0)
		place(enemyAirMap, BEHIND, RAPTOR, 0)
		expect(scoreAttack(enemyAirMap, attacker2, ATTACKER, target2, TARGET).score).toBe(baseline)

		const friendlyAirMap = makeMap()
		const attacker3 = place(friendlyAirMap, ATTACKER, LANCE, 1)
		const target3 = place(friendlyAirMap, TARGET, GRUNT, 0)
		place(friendlyAirMap, BEHIND, RAPTOR, 1)
		expect(scoreAttack(friendlyAirMap, attacker3, ATTACKER, target3, TARGET).score).toBe(baseline)
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

describe('Breaker splash awareness', () => {
	const BREAKER = unitData.findIndex((u) => u.name === 'Breaker')
	const MORTAR = unitData.findIndex((u) => u.name === 'Mortar Truck')
	// Attacker at col 1, primary target at col 3 (same row); a second unit sits
	// directly below the target, inside its splash ring.
	const ATTACKER = 1 + 2 * COLS
	const TARGET = 3 + 2 * COLS
	const ADJ = 3 + 3 * COLS

	it('rewards a shot whose target is ringed by other enemies', () => {
		const baseMap = makeMap()
		const attacker = place(baseMap, ATTACKER, BREAKER, 1)
		const target = place(baseMap, TARGET, GRUNT, 0)
		const baseline = scoreAttack(baseMap, attacker, ATTACKER, target, TARGET).score

		const clusterMap = makeMap()
		const attacker2 = place(clusterMap, ATTACKER, BREAKER, 1)
		const target2 = place(clusterMap, TARGET, GRUNT, 0)
		place(clusterMap, ADJ, GRUNT, 0) // second enemy caught in the splash
		const clustered = scoreAttack(clusterMap, attacker2, ATTACKER, target2, TARGET).score

		expect(clustered).toBeGreaterThan(baseline)
	})

	it('penalizes a shot that catches a friendly in the splash (indiscriminate wash)', () => {
		const baseMap = makeMap()
		const attacker = place(baseMap, ATTACKER, BREAKER, 1)
		const target = place(baseMap, TARGET, GRUNT, 0)
		const baseline = scoreAttack(baseMap, attacker, ATTACKER, target, TARGET).score

		const ffMap = makeMap()
		const attacker2 = place(ffMap, ATTACKER, BREAKER, 1)
		const target2 = place(ffMap, TARGET, GRUNT, 0)
		place(ffMap, ADJ, GRUNT, 1) // own unit beside the target — caught in the wash
		const friendlyFire = scoreAttack(ffMap, attacker2, ATTACKER, target2, TARGET).score

		expect(friendlyFire).toBeLessThan(baseline)
	})

	it('costs no penalty for a friendly the splash could never hit (air unit)', () => {
		// A ground splash passes under an air unit, ally or enemy, so a friendly flyer
		// beside the target must not dock the score (mirrors the lance air-overfly case).
		const RAPTOR = unitData.findIndex((u) => u.name === 'Raptor Fighter')
		const baseMap = makeMap()
		const attacker = place(baseMap, ATTACKER, BREAKER, 1)
		const target = place(baseMap, TARGET, GRUNT, 0)
		const baseline = scoreAttack(baseMap, attacker, ATTACKER, target, TARGET).score

		const airMap = makeMap()
		const attacker2 = place(airMap, ATTACKER, BREAKER, 1)
		const target2 = place(airMap, TARGET, GRUNT, 0)
		place(airMap, ADJ, RAPTOR, 1) // friendly air unit beside the target — overflown
		expect(scoreAttack(airMap, attacker2, ATTACKER, target2, TARGET).score).toBe(baseline)
	})

	it('adds no splash value for a non-splash ranged unit', () => {
		const baseMap = makeMap()
		const attacker = place(baseMap, ATTACKER, MORTAR, 1)
		const target = place(baseMap, TARGET, GRUNT, 0)
		const baseline = scoreAttack(baseMap, attacker, ATTACKER, target, TARGET).score

		const clusterMap = makeMap()
		const attacker2 = place(clusterMap, ATTACKER, MORTAR, 1)
		const target2 = place(clusterMap, TARGET, GRUNT, 0)
		place(clusterMap, ADJ, GRUNT, 0)
		expect(scoreAttack(clusterMap, attacker2, ATTACKER, target2, TARGET).score).toBe(baseline)
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
