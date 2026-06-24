// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { canPlaceUnit } from '../../src/lib/Engine/Interactor/Pathing/movement'

const unit = (name: string): UnitObject => {
	const type = unitData.findIndex((u) => u.name === name)
	if (type < 0) throw new Error(`missing unit "${name}"`)
	return { type, team: 0, state: 4 }
}
const ground = (name: string): GroundObject => {
	const type = terrainData.findIndex((t) => t.name === name)
	if (type < 0) throw new Error(`missing terrain "${name}"`)
	return { type, state: 0 }
}

describe('canPlaceUnit (map editor placement validity)', () => {
	it('keeps ground units off the sea and ships off the land', () => {
		expect(canPlaceUnit(ground('Sea'), unit('Scorpion Tank'))).toBe(false)
		expect(canPlaceUnit(ground('Plains'), unit('Corvette'))).toBe(false)
		expect(canPlaceUnit(ground('Plains'), unit('Scorpion Tank'))).toBe(true)
		expect(canPlaceUnit(ground('Sea'), unit('Corvette'))).toBe(true)
	})

	it('forbids every unit on a volcano (impassable terrain)', () => {
		expect(canPlaceUnit(ground('Volcano'), unit('Scorpion Tank'))).toBe(false)
		expect(canPlaceUnit(ground('Volcano'), unit('Corvette'))).toBe(false)
		expect(canPlaceUnit(ground('Volcano'), unit('Raptor Fighter'))).toBe(false)
	})

	it('lets air units stand anywhere passable', () => {
		expect(canPlaceUnit(ground('Sea'), unit('Raptor Fighter'))).toBe(true)
		expect(canPlaceUnit(ground('Mountain'), unit('Raptor Fighter'))).toBe(true)
		expect(canPlaceUnit(ground('Volcano'), unit('Raptor Fighter'))).toBe(false)
	})

	it('rejects movement types that could never traverse the terrain', () => {
		// Tanks/wheels cannot climb rugged terrain (mountains).
		expect(canPlaceUnit(ground('Mountain'), unit('Scorpion Tank'))).toBe(false)
		// Foot units can.
		expect(canPlaceUnit(ground('Mountain'), unit('Strike Commando'))).toBe(true)
		// Warships cannot sit on the shore even though it straddles land/sea.
		expect(canPlaceUnit(ground('Shore'), unit('Corvette'))).toBe(false)
	})

	it('permits immobile units (Turret, Blockade) that validTerrain would reject', () => {
		expect(canPlaceUnit(ground('Plains'), unit('Turret'))).toBe(true)
		expect(canPlaceUnit(ground('Plains'), unit('Blockade'))).toBe(true)
		// Still bound by terrain type — no turret on the open sea or a volcano.
		expect(canPlaceUnit(ground('Sea'), unit('Turret'))).toBe(false)
		expect(canPlaceUnit(ground('Volcano'), unit('Turret'))).toBe(false)
	})

	it('lets both ground and sea units occupy a High Bridge', () => {
		expect(canPlaceUnit(ground('High Bridge'), unit('Scorpion Tank'))).toBe(true)
		expect(canPlaceUnit(ground('High Bridge'), unit('Corvette'))).toBe(true)
	})
})
