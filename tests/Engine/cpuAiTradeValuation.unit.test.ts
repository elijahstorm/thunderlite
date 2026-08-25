// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/lib/Engine/Animator/animator', () => ({
	animateRoute: () => Promise.resolve(),
	animateHealthBar: () => Promise.resolve(),
	panBoardToBuiltUnit: () => false,
}))
vi.mock('../../src/lib/Audio/audioEngine', () => ({ audioEngine: { playSfx: () => {} } }))

import { scoreAttack, scorePositionBonus } from '../../src/lib/Engine/cpuAi/score'
import { rankBuildableTypes } from '../../src/lib/Engine/cpuAi/production'
import { generatePlansFor } from '../../src/lib/Engine/cpuAi/candidates'
import { gameState, initGameStateFromMap, NEUTRAL_TEAM } from '../../src/lib/Engine/gameState'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

/**
 * Regression cover for the trade-valuation pass (see REPLAY-19 analysis).
 *
 * The CPU used to price damage as a flat "1/40th of a unit per HP", which is exactly
 * right for the 40-HP commandos and 3.5x too generous against a 140-HP Annihilator
 * Tank. On a real 24-round board that produced two symptoms these tests pin down:
 * 39% of all unit deaths were the attacker walking into a counterattack it chose,
 * and every late-game turn collapsed into Annihilators head-butting at a chokepoint.
 * Alongside it, production charged indirect units for a counterattack they never
 * receive, so not one ranged unit was built across the whole match.
 */

const T = (name: string) => unitData.findIndex((u) => u.name === name)
const B = (name: string) => buildingData.findIndex((b) => b.name === name)
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')

const HEAVY = T('Heavy Commando')
const SCORPION = T('Scorpion Tank')
const ANNIHILATOR = T('Annihilator Tank')
const MORTAR = T('Mortar Truck')

const COLS = 8
const ROWS = 8
const N = COLS * ROWS

const makeMap = (): MapObject =>
	({
		cols: COLS,
		rows: ROWS,
		layers: {
			ground: new Array(N).fill(0).map(() => ({ type: PLAINS, state: 0 })),
			sky: new Array(N).fill(null),
			units: new Array(N).fill(null),
			buildings: new Array(N).fill(null),
		},
		highlights: new Array(N),
		route: [],
		pathHistory: [],
	}) as unknown as MapObject

const place = (map: MapObject, tile: number, type: number, team: number, health?: number) => {
	const unit = { type, state: 0, team, health: health ?? unitData[type].health } as UnitObject
	map.layers.units[tile] = unit
	return unit
}

describe('attack trades are priced against the target’s own health pool', () => {
	it('refuses a chip attack that trades the attacker away', () => {
		// The exact shot from round 10 of match 19: a half-dead Scorpion Tank walks up
		// to a full-health Annihilator, scratches it, and dies to the counter. The CPU
		// did this twice in one turn because the old scorer rated it +110.
		const map = makeMap()
		const attacker = place(map, 1, SCORPION, 0, 41)
		const defender = place(map, 2, ANNIHILATOR, 1)
		const result = scoreAttack(map, attacker, 1, defender, 2)

		expect(result.returnDamage).toBeGreaterThanOrEqual(41)
		expect(result.killsTarget).toBe(false)
		expect(result.score).toBeLessThan(0)
	})

	it('rates the same shot higher the more of the attacker survives it', () => {
		// Survivability has to move the score monotonically. The old scorer priced only
		// the return damage, so a tank that would die looked barely worse than one that
		// would walk away, and the CPU fed both in.
		const healthy = makeMap()
		const strong = place(healthy, 1, SCORPION, 0)
		place(healthy, 2, ANNIHILATOR, 1)
		const dying = makeMap()
		const weak = place(dying, 1, SCORPION, 0, 41)
		place(dying, 2, ANNIHILATOR, 1)

		const strongScore = scoreAttack(healthy, strong, 1, healthy.layers.units[2]!, 2).score
		const weakScore = scoreAttack(dying, weak, 1, dying.layers.units[2]!, 2).score
		expect(strongScore).toBeGreaterThan(weakScore)
	})

	it('keeps a genuinely favourable trade positive', () => {
		// A Heavy Commando's heavy weapon bites hard into heavy armour and it survives
		// the counter. The fix must not turn the CPU passive, only selective.
		const map = makeMap()
		const attacker = place(map, 1, HEAVY, 0)
		const defender = place(map, 2, ANNIHILATOR, 1)
		const result = scoreAttack(map, attacker, 1, defender, 2)
		expect(result.returnDamage).toBeLessThan(attacker.health!)
		expect(result.score).toBeGreaterThan(0)
	})

	it('never prices damage short of a kill above the whole target', () => {
		// The headline bug: "1 HP = 1/40th of a unit" meant a 95-damage bite out of a
		// 140-HP Annihilator scored ~906, nearly twice what destroying the tank outright
		// is worth. Damage that leaves the target alive cannot exceed its full value.
		const map = makeMap()
		const chipper = place(map, 1, ANNIHILATOR, 0)
		const brick = place(map, 2, ANNIHILATOR, 1)
		const chip = scoreAttack(map, chipper, 1, brick, 2)

		expect(chip.killsTarget).toBe(false)
		expect(chip.score).toBeGreaterThan(0)
		expect(chip.score).toBeLessThan(unitData[ANNIHILATOR].cost)
	})

	it('prefers finishing a wounded brick over chipping a fresh one', () => {
		const finishMap = makeMap()
		const a1 = place(finishMap, 1, HEAVY, 0)
		const wounded = place(finishMap, 2, ANNIHILATOR, 1, 20)
		const finish = scoreAttack(finishMap, a1, 1, wounded, 2)

		const chipMap = makeMap()
		const a2 = place(chipMap, 1, HEAVY, 0)
		const fresh = place(chipMap, 2, ANNIHILATOR, 1)
		const chip = scoreAttack(chipMap, a2, 1, fresh, 2)

		expect(finish.killsTarget).toBe(true)
		expect(finish.score).toBeGreaterThan(chip.score)
	})
})

describe('production accounts for standoff range', () => {
	const armyOfMelee = () => {
		const map = makeMap()
		map.layers.buildings[0] = { type: B('Ground Control'), state: 0, team: 0 } as BuildingObject
		// A purely melee enemy line: nothing here can reach past one tile.
		for (const tile of [40, 41, 42, 43]) place(map, tile, ANNIHILATOR, 1)
		place(map, 8, HEAVY, 0)
		place(map, 9, HEAVY, 0)
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, players: s.players.map((p) => ({ ...p, money: 99999 })) }))
		return map
	}

	it('ranks an indirect unit above a direct one of similar price against a melee army', () => {
		const map = armyOfMelee()
		const ranked = rankBuildableTypes(map, 0, { ignoreControls: true, budget: 99999 })
		const scoreOf = (type: number) => ranked.find((r) => r.type === type)?.score ?? -Infinity
		// Mortar Truck ($285, range 2-3) vs Scorpion Tank ($270, range 1). Comparable
		// cost, but only one of them eats a counterattack from an Annihilator line.
		expect(scoreOf(MORTAR)).toBeGreaterThan(scoreOf(SCORPION))
	})

	it('drops that preference when the enemy line outranges the artillery too', () => {
		// Against a melee line only the Mortar Truck is safe. Against an enemy artillery
		// line the exposure inverts: the Mortar sits inside their firing band, while a
		// tank closing to one tile is under their minimum range and can't be countered
		// at all. Comparing the same two candidates on both boards isolates the range
		// model from the damage matchup, which differs between the two armies.
		const armyOf = (type: number) => {
			const map = makeMap()
			map.layers.buildings[0] = { type: B('Ground Control'), state: 0, team: 0 } as BuildingObject
			for (const tile of [40, 41, 42, 43]) place(map, tile, type, 1)
			place(map, 8, HEAVY, 0)
			place(map, 9, HEAVY, 0)
			initGameStateFromMap(map)
			gameState.update((s) => ({ ...s, players: s.players.map((p) => ({ ...p, money: 99999 })) }))
			const ranked = rankBuildableTypes(map, 0, { ignoreControls: true, budget: 99999 })
			const scoreOf = (t: number) => ranked.find((r) => r.type === t)?.score ?? -Infinity
			return scoreOf(MORTAR) - scoreOf(SCORPION)
		}

		expect(armyOf(ANNIHILATOR)).toBeGreaterThan(0)
		expect(armyOf(MORTAR)).toBeLessThan(armyOf(ANNIHILATOR))
	})
})

describe('self-actions pay the tile’s full positional price', () => {
	it('offers no repair plan to a unit that has nothing worth healing', () => {
		const map = makeMap()
		const unit = place(map, 20, ANNIHILATOR, 0, 139) // 99% health
		initGameStateFromMap(map)
		const plans = generatePlansFor(map, 20, unit, 0)
		expect(plans.some((p) => p.kind === 'repair')).toBe(false)
	})

	it('still offers repair to a genuinely wounded unit', () => {
		const map = makeMap()
		const unit = place(map, 20, ANNIHILATOR, 0, 40)
		initGameStateFromMap(map)
		const plans = generatePlansFor(map, 20, unit, 0)
		expect(plans.some((p) => p.kind === 'repair')).toBe(true)
	})

	it('does not let repairing out-rank waiting on the same tile by a discount', () => {
		const map = makeMap()
		const unit = place(map, 20, ANNIHILATOR, 0, 40)
		initGameStateFromMap(map)
		const plans = generatePlansFor(map, 20, unit, 0)
		const repair = plans.find((p) => p.kind === 'repair')!
		const waitHere = plans.find((p) => p.kind === 'wait' && p.actions.length === 1)!
		// Repair beats standing still only by what the healing is actually worth.
		expect(repair.score - waitHere.score).toBeLessThan(120)
	})
})

describe('units that cannot capture keep off the objective', () => {
	const boardWithNeutralRefinery = (unitType: number) => {
		const map = makeMap()
		map.layers.buildings[20] = {
			type: B('Oil Refinery'),
			state: 0,
			team: NEUTRAL_TEAM,
			stature: buildingData[B('Oil Refinery')].stature,
		} as BuildingObject
		const unit = place(map, 20, unitType, 0)
		initGameStateFromMap(map)
		return { map, unit }
	}

	it('docks a tank for standing on a building it can never take', () => {
		const onBuilding = boardWithNeutralRefinery(ANNIHILATOR)
		const onGround = boardWithNeutralRefinery(ANNIHILATOR)
		onGround.map.layers.units[20] = null
		const beside = place(onGround.map, 21, ANNIHILATOR, 0)

		const squatting = scorePositionBonus(onBuilding.map, 20, onBuilding.unit, 0)
		const adjacent = scorePositionBonus(onGround.map, 21, beside, 0)
		expect(squatting).toBeLessThan(adjacent)
	})

	it('leaves a capture-capable unit free to sit on it', () => {
		const { map, unit } = boardWithNeutralRefinery(HEAVY)
		const onBuilding = scorePositionBonus(map, 20, unit, 0)

		const plainMap = makeMap()
		const plainUnit = place(plainMap, 20, HEAVY, 0)
		initGameStateFromMap(plainMap)
		const onPlains = scorePositionBonus(plainMap, 20, plainUnit, 0)

		expect(onBuilding).toBeGreaterThanOrEqual(onPlains)
	})
})
