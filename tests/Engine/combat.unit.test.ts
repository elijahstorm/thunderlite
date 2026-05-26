// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { calculateDamage, previewDamage, canCounterAttack } from '../../src/lib/Engine/combat'
import { canAttackTarget } from '../../src/lib/Engine/modifiers/canAttack'
import { generateAttackList } from '../../src/lib/Engine/Interactor/Pathing/attack'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'

const unitIndex = (name: string): number => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`Unit not found: ${name}`)
	return idx
}

const terrainIndex = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`Terrain not found: ${name}`)
	return idx
}

const STRIKE_COMMANDO = unitIndex('Strike Commando')
const HEAVY_COMMANDO = unitIndex('Heavy Commando')
const ANNIHILATOR = unitIndex('Annihilator Tank')

const ROAD = terrainIndex('Road')
const MOUNTAIN = terrainIndex('Mountain')

const makeMap = (size = 4): Pick<MapObject, 'layers'> => ({
	layers: {
		ground: new Array(size * size).fill(0).map(() => ({ type: ROAD, state: 0 })),
		sky: new Array(size * size).fill(null),
		units: new Array(size * size).fill(null),
		buildings: new Array(size * size).fill(null),
	},
})

const unit = (type: number, team = 0, health?: number): UnitObject => ({
	type,
	state: 0,
	team,
	...(health !== undefined ? { health } : {}),
})

describe('calculateDamage', () => {
	it('applies a 1.5x matchup bonus when attacker weapon equals defender armor', () => {
		const map = makeMap()
		const attacker = unit(STRIKE_COMMANDO, 0)
		const defender = unit(STRIKE_COMMANDO, 1)

		// Strike Commando: power 20, weapon=light, target armor=light.
		// On Road (protection 0): 20 * 1.5 * 1.0 = 30.
		expect(calculateDamage(attacker, defender, { map, defenderTile: 0 })).toBe(30)
	})

	it('does not apply the matchup bonus when weapon does not match armor', () => {
		const map = makeMap()
		const attacker = unit(HEAVY_COMMANDO, 0)
		const defender = unit(STRIKE_COMMANDO, 1)

		// Heavy Commando: power 35, weapon=heavy. Strike Commando armor=light → no match.
		// On Road: 35 * 1.0 * 1.0 = 35.
		expect(calculateDamage(attacker, defender, { map, defenderTile: 0 })).toBe(35)
	})

	it('deals less damage on a mismatch than a same-class matchup with the same attacker', () => {
		const map = makeMap()
		const attacker = unit(HEAVY_COMMANDO, 0)

		// Heavy Commando vs Strike Commando (heavy vs light) — no matchup bonus.
		const mismatchDamage = calculateDamage(attacker, unit(STRIKE_COMMANDO, 1), {
			map,
			defenderTile: 0,
		})
		// Heavy Commando vs Annihilator (heavy vs heavy) — full 1.5x bonus.
		const matchupDamage = calculateDamage(attacker, unit(ANNIHILATOR, 1), { map, defenderTile: 0 })

		expect(mismatchDamage).toBeLessThan(matchupDamage)
	})

	it('scales damage by attacker current HP / max HP', () => {
		const map = makeMap()
		const defender = unit(ANNIHILATOR, 1) // armor=heavy

		const fullHP = calculateDamage(unit(ANNIHILATOR, 0), defender, {
			map,
			defenderTile: 0,
		})
		const wounded = calculateDamage(unit(ANNIHILATOR, 0, 70), defender, {
			map,
			defenderTile: 0,
		})

		// Annihilator: max HP 140. At 70/140 the attacker should hit for exactly half.
		expect(wounded).toBe(Math.round(fullHP / 2))
		// And spell out the expected absolute numbers too — power 70, 1.5 matchup, road 0% protection.
		// full = round(70 * 1.0 * 1.5 * 1.0) = 105.  wounded = round(70 * 0.5 * 1.5 * 1.0) = 53.
		expect(fullHP).toBe(105)
		expect(wounded).toBe(53)
	})

	it('reduces damage by the defender tile terrain protection', () => {
		const cols = 4
		const map: Pick<MapObject, 'layers'> = {
			layers: {
				ground: new Array(cols * cols).fill(0).map(() => ({ type: ROAD, state: 0 })),
				sky: new Array(cols * cols).fill(null),
				units: new Array(cols * cols).fill(null),
				buildings: new Array(cols * cols).fill(null),
			},
		}
		map.layers.ground[5] = { type: MOUNTAIN, state: 0 }

		const attacker = unit(STRIKE_COMMANDO, 0)
		const defender = unit(STRIKE_COMMANDO, 1)

		const onRoad = calculateDamage(attacker, defender, { map, defenderTile: 0 })
		const onMountain = calculateDamage(attacker, defender, { map, defenderTile: 5 })

		// Mountain has protection 0.4 → 40% less damage.
		expect(onMountain).toBe(Math.round(onRoad * 0.6))
		expect(onRoad).toBe(30)
		expect(onMountain).toBe(18)
	})

	it('never returns a negative value', () => {
		const map = makeMap()
		// Build a zero-power attacker by sending in a Blockade (power 0).
		const blockade = unit(unitIndex('Blockade'), 0)
		const target = unit(STRIKE_COMMANDO, 1)

		expect(calculateDamage(blockade, target, { map, defenderTile: 0 })).toBe(0)
	})

	it('always returns an integer', () => {
		const map = makeMap()
		// Wounded attacker introduces a fractional baseDamage that must be rounded.
		const attacker = unit(STRIKE_COMMANDO, 0, 13) // 13/40 → non-trivial fraction
		const defender = unit(HEAVY_COMMANDO, 1) // armor=light, weapon-of-attacker=light → matchup

		const dmg = calculateDamage(attacker, defender, { map, defenderTile: 0 })
		expect(Number.isInteger(dmg)).toBe(true)
		expect(dmg).toBeGreaterThanOrEqual(0)
	})

	it('previewDamage matches calculateDamage', () => {
		const map = makeMap()
		const attacker = unit(HEAVY_COMMANDO, 0)
		const defender = unit(ANNIHILATOR, 1)

		expect(previewDamage(attacker, defender, { map, defenderTile: 0 })).toBe(
			calculateDamage(attacker, defender, { map, defenderTile: 0 })
		)
	})
})

const SCORPION = unitIndex('Scorpion Tank')
const FLAK_TANK = unitIndex('Flak Tank')
const RAPTOR = unitIndex('Raptor Fighter')
const SPIDER = unitIndex('Spider Tank')
const MORTAR = unitIndex('Mortar Truck')
const ROCKET = unitIndex('Rocket Truck')
const CORVETTE = unitIndex('Corvette')
const HUNTER_SUPPORT = unitIndex('Hunter Support')
const TURRET = unitIndex('Turret')

describe('damage multipliers (B2)', () => {
	it('Damage.Flak — Flak Tank deals 2× damage to a light-armor target', () => {
		const map = makeMap()
		const flak = unit(FLAK_TANK, 0)
		const raptor = unit(RAPTOR, 1)

		// Flak Tank: power 17, weapon=light, target Raptor armor=light → 1.5× matchup.
		// Flak modifier multiplier: 2 (raptor armor is light).
		// Damage = round(17 * 1.0 * 1.5 * 1.0 * 2) = 51.
		expect(calculateDamage(flak, raptor, { map, defenderTile: 0 })).toBe(51)
	})

	it('Damage.Flak — no bonus against a non-light-armor target', () => {
		const map = makeMap()
		const flak = unit(FLAK_TANK, 0)
		const scorpion = unit(SCORPION, 1) // armor=medium

		const noFlak = calculateDamage(flak, scorpion, { map, defenderTile: 0 })
		// power 17, weapon=light vs armor=medium → no matchup. base = 17.
		expect(noFlak).toBe(17)
	})

	it('Damage.Fast_Attack — Scorpion attacking deals 1.2×', () => {
		const map = makeMap()
		const scorpion = unit(SCORPION, 0)
		const otherScorpion = unit(SCORPION, 1)

		// Scorpion: power 35, weapon=medium, armor=medium → 1.5× matchup.
		// As attacker, Fast_Attack adds 1.2×.
		// base = round(35 * 1.5 * 1.0 * 1.2) = round(63) = 63.
		expect(calculateDamage(scorpion, otherScorpion, { map, defenderTile: 0, role: 'attack' })).toBe(
			63
		)
	})

	it('Damage.Fast_Attack — no bonus when countering', () => {
		const map = makeMap()
		const scorpion = unit(SCORPION, 0)
		const otherScorpion = unit(SCORPION, 1)

		// Countering, no Fast_Attack bonus. round(35 * 1.5) = 53.
		expect(
			calculateDamage(scorpion, otherScorpion, { map, defenderTile: 0, role: 'counter' })
		).toBe(53)
	})

	it('Damage.Slow_Attack — Annihilator counter-attacks at 0.85×', () => {
		const map = makeMap()
		const annihilator = unit(ANNIHILATOR, 0)
		const otherAnnihilator = unit(ANNIHILATOR, 1)

		const primary = calculateDamage(annihilator, otherAnnihilator, {
			map,
			defenderTile: 0,
			role: 'attack',
		})
		const counter = calculateDamage(annihilator, otherAnnihilator, {
			map,
			defenderTile: 0,
			role: 'counter',
		})

		// Annihilator: power 70, heavy vs heavy → 1.5× matchup.
		// primary = round(70 * 1.5) = 105.
		// counter = round(70 * 1.5 * 0.85) = round(89.25) = 89.
		expect(primary).toBe(105)
		expect(counter).toBe(89)
	})
})

describe('Can_Attack gates (B2)', () => {
	it('Air_Raid — Flak Tank can target a Raptor Fighter', () => {
		expect(canAttackTarget(unit(FLAK_TANK, 0), unit(RAPTOR, 1))).toBe(true)
	})

	it('Air_Raid — Strike Commando cannot target a Raptor Fighter', () => {
		expect(canAttackTarget(unit(STRIKE_COMMANDO, 0), unit(RAPTOR, 1))).toBe(false)
	})

	it('Bombard — Scorpion (Bombard) can target a Corvette (sea)', () => {
		expect(canAttackTarget(unit(SCORPION, 0), unit(CORVETTE, 1))).toBe(true)
	})

	it('Bombard — Strike Commando cannot target a Corvette (sea)', () => {
		expect(canAttackTarget(unit(STRIKE_COMMANDO, 0), unit(CORVETTE, 1))).toBe(false)
	})

	it('Ground_Assult — Corvette can target a ground unit', () => {
		expect(canAttackTarget(unit(CORVETTE, 0), unit(STRIKE_COMMANDO, 1))).toBe(true)
	})

	it('Ground_Assult — Hunter Support (sea, no Ground_Assult) cannot target a ground unit', () => {
		expect(canAttackTarget(unit(HUNTER_SUPPORT, 0), unit(STRIKE_COMMANDO, 1))).toBe(false)
	})
})

const COLS = 5
const ROWS = 5

const makeFullMap = (): MapObject => ({
	cols: COLS,
	rows: ROWS,
	layers: {
		ground: new Array(COLS * ROWS).fill(0).map(() => ({ type: ROAD, state: 0 })),
		sky: new Array(COLS * ROWS).fill(null),
		units: new Array(COLS * ROWS).fill(null),
		buildings: new Array(COLS * ROWS).fill(null),
	},
	filters: {
		ground: () => [],
		sky: () => [],
		units: () => [],
		buildings: () => [],
	},
	route: new Array(COLS * ROWS).fill(undefined),
	highlights: new Array(COLS * ROWS).fill(undefined),
})

describe('canCounterAttack (B2)', () => {
	it('basic melee — Strike Commando counters Strike Commando at adjacent tile', () => {
		const map = makeFullMap()
		const attackerTile = 0
		const defenderTile = 1
		map.layers.units[attackerTile] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[defenderTile] = unit(STRIKE_COMMANDO, 1, 30)

		expect(
			canCounterAttack(map.layers.units[attackerTile]!, map.layers.units[defenderTile]!, {
				map,
				attackerTile,
				defenderTile,
			})
		).toBe(true)
	})

	it('Mortar Truck cannot counter a Strike Commando attacking from an adjacent tile (out of mortar range)', () => {
		const map = makeFullMap()
		const attackerTile = 0
		const defenderTile = 1
		map.layers.units[attackerTile] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[defenderTile] = unit(MORTAR, 1, 40)

		expect(
			canCounterAttack(map.layers.units[attackerTile]!, map.layers.units[defenderTile]!, {
				map,
				attackerTile,
				defenderTile,
			})
		).toBe(false)
	})

	it('Spider Tank (Attack.Stun) attacking — defender cannot counter', () => {
		const map = makeFullMap()
		const attackerTile = 0
		const defenderTile = 1
		map.layers.units[attackerTile] = unit(SPIDER, 0)
		map.layers.units[defenderTile] = unit(SCORPION, 1, 40)

		expect(
			canCounterAttack(map.layers.units[attackerTile]!, map.layers.units[defenderTile]!, {
				map,
				attackerTile,
				defenderTile,
			})
		).toBe(false)
	})

	it('Ground defender cannot counter an air attacker without Air_Raid', () => {
		const map = makeFullMap()
		const attackerTile = 0
		const defenderTile = 1
		// Raptor attacks Scorpion from adjacent tile.
		map.layers.units[attackerTile] = unit(RAPTOR, 0)
		map.layers.units[defenderTile] = unit(SCORPION, 1, 30)

		expect(
			canCounterAttack(map.layers.units[attackerTile]!, map.layers.units[defenderTile]!, {
				map,
				attackerTile,
				defenderTile,
			})
		).toBe(false)
	})

	it('Flak Tank (Air_Raid) can counter an air attacker', () => {
		const map = makeFullMap()
		const attackerTile = 0
		const defenderTile = 1
		map.layers.units[attackerTile] = unit(RAPTOR, 0)
		map.layers.units[defenderTile] = unit(FLAK_TANK, 1, 50)

		expect(
			canCounterAttack(map.layers.units[attackerTile]!, map.layers.units[defenderTile]!, {
				map,
				attackerTile,
				defenderTile,
			})
		).toBe(true)
	})

	it('Counter_Range — Mortar Truck counters another Mortar Truck at range', () => {
		const map = makeFullMap()
		// Tiles: attacker at 0, defender at 2 (distance 2 horizontally).
		const attackerTile = 0
		const defenderTile = 2
		map.layers.units[attackerTile] = unit(MORTAR, 0)
		map.layers.units[defenderTile] = unit(MORTAR, 1, 40)

		expect(
			canCounterAttack(map.layers.units[attackerTile]!, map.layers.units[defenderTile]!, {
				map,
				attackerTile,
				defenderTile,
			})
		).toBe(true)
	})

	it('No Counter_Range — Turret (ranged) cannot counter a Rocket Truck attack', () => {
		const map = makeFullMap()
		// Tile layout: attacker (Rocket) at 0, defender (Turret) at 3 (distance 3).
		const attackerTile = 0
		const defenderTile = 3
		map.layers.units[attackerTile] = unit(ROCKET, 0)
		map.layers.units[defenderTile] = unit(TURRET, 1, 60)

		// Turret has no Counter_Range — ranged defender without Counter_Range cannot counter.
		expect(
			canCounterAttack(map.layers.units[attackerTile]!, map.layers.units[defenderTile]!, {
				map,
				attackerTile,
				defenderTile,
			})
		).toBe(false)
	})

	it('dead defender cannot counter', () => {
		const map = makeFullMap()
		const attackerTile = 0
		const defenderTile = 1
		map.layers.units[attackerTile] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[defenderTile] = unit(STRIKE_COMMANDO, 1, 0)

		expect(
			canCounterAttack(map.layers.units[attackerTile]!, map.layers.units[defenderTile]!, {
				map,
				attackerTile,
				defenderTile,
			})
		).toBe(false)
	})
})

describe('generateAttackList target filtering (B2)', () => {
	it('Strike Commando cannot select Raptor Fighter as an attack target', () => {
		const map = makeFullMap()
		const commandoTile = 6 // arbitrary interior tile
		const raptorTile = 7 // adjacent
		map.layers.units[commandoTile] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[raptorTile] = unit(RAPTOR, 1)

		const attackable = generateAttackList(map, commandoTile, map.layers.units[commandoTile]!)
		expect(attackable).not.toContain(raptorTile)
	})

	it('Flak Tank can select Raptor Fighter as an attack target', () => {
		const map = makeFullMap()
		const flakTile = 6
		const raptorTile = 7
		map.layers.units[flakTile] = unit(FLAK_TANK, 0)
		map.layers.units[raptorTile] = unit(RAPTOR, 1)

		const attackable = generateAttackList(map, flakTile, map.layers.units[flakTile]!)
		expect(attackable).toContain(raptorTile)
	})
})
