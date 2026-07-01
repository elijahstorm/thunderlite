// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { huntScenes } from '../../src/lib/Dev/huntScenes'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { isStealthUnit } from '../../src/lib/Engine/visibility'

const WARFACTORY = buildingData.findIndex((b) => b.name === 'Warfactory')
const UBOAT = unitData.findIndex((u) => u.name === 'U-Boat')

describe('hunt scenes', () => {
	it('exposes a varied, multi-scene roster including an ocean battle', () => {
		expect(huntScenes.length).toBeGreaterThanOrEqual(5)
		expect(huntScenes.map((s) => s.id)).toContain('naval')
	})

	for (const scene of huntScenes) {
		describe(scene.name, () => {
			const map = scene.build()

			it('builds a consistent board', () => {
				expect(map.cols).toBeGreaterThan(0)
				expect(map.rows).toBeGreaterThan(0)
				expect(map.layers.ground.length).toBe(map.cols * map.rows)
			})

			it('fields a player cloak unit and a CPU presence', () => {
				const units = map.layers.units.filter(Boolean) as UnitObject[]
				const playerStealth = units.filter((u) => u.team === 0 && isStealthUnit(u))
				const cpu = units.filter((u) => u.team === 1)
				expect(playerStealth.length).toBeGreaterThan(0)
				expect(cpu.length).toBeGreaterThan(0)
			})
		})
	}

	it('the naval scene is a submarine fight', () => {
		const naval = huntScenes.find((s) => s.id === 'naval')!.build()
		const units = naval.layers.units.filter(Boolean) as UnitObject[]
		expect(units.some((u) => u.team === 0 && u.type === UBOAT)).toBe(true)
	})

	it('land scenes give the CPU a factory to build from', () => {
		for (const scene of huntScenes.filter((s) => s.id !== 'naval')) {
			const map = scene.build()
			const hasFactory = map.layers.buildings.some(
				(b) => b && b.team === 1 && b.type === WARFACTORY
			)
			expect(hasFactory, `${scene.name} should give the CPU a Warfactory`).toBe(true)
		}
	})
})
