// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { fogScenes } from '../../src/lib/Dev/fogScenes'

describe('fog belief scenes', () => {
	it('exposes a few scenes', () => {
		expect(fogScenes.length).toBeGreaterThanOrEqual(3)
	})

	for (const scene of fogScenes) {
		describe(scene.name, () => {
			const map = scene.build()

			it('builds a fog-on board with both sides present', () => {
				expect(map.cols).toBeGreaterThan(0)
				expect(map.layers.ground.length).toBe(map.cols * map.rows)
				expect(map.fog).toBe(true)
				const units = map.layers.units.filter(Boolean) as UnitObject[]
				expect(units.some((u) => u.team === 0)).toBe(true)
				expect(units.some((u) => u.team === 1)).toBe(true)
			})
		})
	}
})
