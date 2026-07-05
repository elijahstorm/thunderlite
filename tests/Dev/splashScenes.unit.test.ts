// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { splashScenes } from '../../src/lib/Dev/splashScenes'
import { splashTargetTiles } from '../../src/lib/Engine/modifiers/splash'
import { aoePreviewTiles } from '../../src/lib/Engine/aoePreview'
import { computeBehindTile } from '../../src/lib/Engine/modifiers/lance'

const byId = (id: string) => {
	const scene = splashScenes.find((s) => s.id === id)
	if (!scene) throw new Error(`missing splash scene: ${id}`)
	return scene
}

const T = (map: MapObject, x: number, y: number) => y * map.cols + x

describe('splash / AoE playground scenes', () => {
	it('exposes the full roster of secondary-hit scenes', () => {
		expect(splashScenes.length).toBeGreaterThanOrEqual(5)
	})

	for (const scene of splashScenes) {
		it(`${scene.name} builds a board with both teams and a tips list`, () => {
			const map = scene.build()
			expect(map.layers.ground.length).toBe(map.cols * map.rows)
			const units = map.layers.units.filter(Boolean) as UnitObject[]
			expect(units.some((u) => u.team === 0)).toBe(true)
			expect(units.some((u) => u.team === 1)).toBe(true)
			expect(scene.tips.length).toBeGreaterThan(0)
		})
	}

	it('flame-wash: the Scorcher washes both flanking foes but not its own tile or the empty forest', () => {
		const map = byId('flame-wash').build()
		const attacker = T(map, 2, 3)
		const target = T(map, 3, 3)
		const hit = new Set(splashTargetTiles(map, attacker, target))
		expect(hit.has(T(map, 3, 2))).toBe(true) // enemy above
		expect(hit.has(T(map, 3, 4))).toBe(true) // enemy below
		expect(hit.has(T(map, 4, 3))).toBe(false) // empty forest — no unit to splash
		expect(hit.has(attacker)).toBe(false) // never itself
	})

	it('friendly-fire: the wash catches the attacker’s own adjacent unit', () => {
		const map = byId('friendly-fire').build()
		const attacker = T(map, 2, 3)
		const target = T(map, 3, 3)
		const ally = T(map, 3, 2)
		const enemy = T(map, 3, 4)
		expect(map.layers.units[ally]?.team).toBe(0) // it really is ours
		const hit = new Set(splashTargetTiles(map, attacker, target))
		expect(hit.has(ally)).toBe(true)
		expect(hit.has(enemy)).toBe(true)
	})

	it('air-overfly: a ground splash skips flanking air units, ally or enemy', () => {
		const map = byId('air-overfly').build()
		const attacker = T(map, 2, 3)
		const target = T(map, 3, 3)
		const hit = new Set(splashTargetTiles(map, attacker, target))
		expect(hit.has(T(map, 3, 4))).toBe(true) // ground enemy — splashed
		expect(hit.has(T(map, 3, 2))).toBe(false) // friendly air — overflown
		expect(hit.has(T(map, 4, 3))).toBe(false) // enemy air — overflown
	})

	it('pierce-line: the lance preview lands on the unit behind — enemy and friendly alike', () => {
		const map = byId('pierce-line').build()

		const lanceA = map.layers.units[T(map, 2, 2)]!
		const enemyLine = aoePreviewTiles(map, lanceA, T(map, 2, 2), T(map, 3, 2))
		expect(enemyLine).toContain(computeBehindTile(map, T(map, 2, 2), T(map, 3, 2)))
		expect(enemyLine).toContain(T(map, 4, 2)) // enemy directly behind

		const lanceB = map.layers.units[T(map, 2, 4)]!
		const friendlyLine = aoePreviewTiles(map, lanceB, T(map, 2, 4), T(map, 3, 4))
		expect(friendlyLine).toContain(T(map, 4, 4)) // our own unit behind — still previewed
		expect(map.layers.units[T(map, 4, 4)]?.team).toBe(0)
	})
})
