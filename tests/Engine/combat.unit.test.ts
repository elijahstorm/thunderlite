// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { calculateDamage, previewDamage } from '../../src/lib/Engine/combat'
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
		const mismatchDamage = calculateDamage(
			attacker,
			unit(STRIKE_COMMANDO, 1),
			{ map, defenderTile: 0 }
		)
		// Heavy Commando vs Annihilator (heavy vs heavy) — full 1.5x bonus.
		const matchupDamage = calculateDamage(
			attacker,
			unit(ANNIHILATOR, 1),
			{ map, defenderTile: 0 }
		)

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
