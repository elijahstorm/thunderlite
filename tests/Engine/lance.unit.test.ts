// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { resetGameState } from '../../src/lib/Engine/gameState'
import {
	applyLancePassthrough,
	computeBehindTile,
} from '../../src/lib/Engine/modifiers/lance'

const unitIndex = (name: string) => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`unknown unit: ${name}`)
	return idx
}

const terrainIndex = (name: string) => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`unknown terrain: ${name}`)
	return idx
}

const LANCE_TANK = unitIndex('Lance Tank')
const STRIKE_COMMANDO = unitIndex('Strike Commando')
const PLAINS = terrainIndex('Plains')

const ground = (type: number): GroundObject => ({ type, state: 0 })
const unit = (type: number, team = 0): UnitObject => ({
	type,
	state: 0,
	team,
	health: unitData[type].health,
})

const makeMap = (cols: number, rows: number): MapObject => ({
	cols,
	rows,
	layers: {
		ground: new Array(cols * rows).fill(0).map(() => ground(PLAINS)),
		sky: new Array(cols * rows).fill(null),
		units: new Array(cols * rows).fill(null),
		buildings: new Array(cols * rows).fill(null),
	},
	filters: {
		ground: () => [],
		sky: () => [],
		units: () => [],
		buildings: () => [],
	},
	route: new Array(cols * rows).fill(undefined),
	highlights: new Array(cols * rows).fill(undefined),
})

const tileXY = (cols: number, x: number, y: number) => y * cols + x

describe('Lance — attack passes through to the tile behind the target', () => {
	beforeEach(() => {
		resetGameState()
	})

	describe('computeBehindTile', () => {
		it('computes the tile behind for a horizontal attack', () => {
			const map = makeMap(5, 5)
			const attacker = tileXY(5, 1, 2)
			const target = tileXY(5, 2, 2)
			expect(computeBehindTile(map, attacker, target)).toBe(tileXY(5, 3, 2))
		})

		it('computes the tile behind for a vertical attack', () => {
			const map = makeMap(5, 5)
			const attacker = tileXY(5, 2, 1)
			const target = tileXY(5, 2, 2)
			expect(computeBehindTile(map, attacker, target)).toBe(tileXY(5, 2, 3))
		})

		it('returns null when the behind tile is off-map (east edge)', () => {
			const map = makeMap(5, 5)
			const attacker = tileXY(5, 3, 2)
			const target = tileXY(5, 4, 2)
			expect(computeBehindTile(map, attacker, target)).toBeNull()
		})

		it('returns null when the behind tile is off-map (south edge)', () => {
			const map = makeMap(5, 5)
			const attacker = tileXY(5, 2, 3)
			const target = tileXY(5, 2, 4)
			expect(computeBehindTile(map, attacker, target)).toBeNull()
		})
	})

	describe('applyLancePassthrough', () => {
		it('damages a unit on the behind tile when attacker has Attack.Lance', () => {
			const map = makeMap(5, 5)
			const attackerTile = tileXY(5, 1, 2)
			const targetTile = tileXY(5, 2, 2)
			const behindTile = tileXY(5, 3, 2)

			map.layers.units[attackerTile] = unit(LANCE_TANK, 0)
			map.layers.units[targetTile] = unit(STRIKE_COMMANDO, 1)
			const passthrough = unit(STRIKE_COMMANDO, 1)
			const initialHealth = passthrough.health!
			map.layers.units[behindTile] = passthrough

			const result = applyLancePassthrough(map, attackerTile, targetTile)

			expect(result).not.toBeNull()
			expect(result?.tile).toBe(behindTile)
			expect(result?.damage).toBeGreaterThan(0)
			expect(passthrough.health!).toBeLessThan(initialHealth)
		})

		it('removes the passthrough target if the hit kills it', () => {
			const map = makeMap(5, 5)
			const attackerTile = tileXY(5, 1, 2)
			const targetTile = tileXY(5, 2, 2)
			const behindTile = tileXY(5, 3, 2)

			map.layers.units[attackerTile] = unit(LANCE_TANK, 0)
			map.layers.units[targetTile] = unit(STRIKE_COMMANDO, 1)
			const passthrough = unit(STRIKE_COMMANDO, 1)
			passthrough.health = 1
			map.layers.units[behindTile] = passthrough

			const result = applyLancePassthrough(map, attackerTile, targetTile)

			expect(result?.killed).toBe(true)
			expect(map.layers.units[behindTile]).toBeNull()
		})

		it('does nothing if the behind tile is empty', () => {
			const map = makeMap(5, 5)
			const attackerTile = tileXY(5, 1, 2)
			const targetTile = tileXY(5, 2, 2)

			map.layers.units[attackerTile] = unit(LANCE_TANK, 0)
			map.layers.units[targetTile] = unit(STRIKE_COMMANDO, 1)

			const result = applyLancePassthrough(map, attackerTile, targetTile)
			expect(result).toBeNull()
		})

		it('does nothing if the behind tile is off-map', () => {
			const map = makeMap(5, 5)
			const attackerTile = tileXY(5, 2, 2)
			const targetTile = tileXY(5, 3, 2)
			const offMapBehind = tileXY(5, 4, 2)

			map.layers.units[attackerTile] = unit(LANCE_TANK, 0)
			map.layers.units[targetTile] = unit(STRIKE_COMMANDO, 1)
			// Put a unit at the would-be-behind position which IS on-map (x=4),
			// but for an attack at x=3 with attacker at x=2, behind is x=4 — still on map.
			// So construct a true off-map case: attacker at x=3, target at x=4 (edge), behind would be x=5.
			map.layers.units[attackerTile] = null
			map.layers.units[targetTile] = null

			const edgeAttacker = tileXY(5, 3, 2)
			const edgeTarget = tileXY(5, 4, 2)
			map.layers.units[edgeAttacker] = unit(LANCE_TANK, 0)
			map.layers.units[edgeTarget] = unit(STRIKE_COMMANDO, 1)
			// Even if a unit existed at offMapBehind (which is off-map), nothing should happen.
			void offMapBehind

			const result = applyLancePassthrough(map, edgeAttacker, edgeTarget)
			expect(result).toBeNull()
		})

		it('does nothing when attacker lacks Attack.Lance', () => {
			const map = makeMap(5, 5)
			const attackerTile = tileXY(5, 1, 2)
			const targetTile = tileXY(5, 2, 2)
			const behindTile = tileXY(5, 3, 2)

			map.layers.units[attackerTile] = unit(STRIKE_COMMANDO, 0)
			map.layers.units[targetTile] = unit(STRIKE_COMMANDO, 1)
			const passthrough = unit(STRIKE_COMMANDO, 1)
			const initialHealth = passthrough.health!
			map.layers.units[behindTile] = passthrough

			const result = applyLancePassthrough(map, attackerTile, targetTile)
			expect(result).toBeNull()
			expect(passthrough.health).toBe(initialHealth)
		})

		it('does not recursively trigger a second passthrough', () => {
			// Lance at (1,2) hits enemy at (2,2). Behind is (3,2) — another enemy.
			// Behind THAT is (4,2) — another enemy. The card states the passthrough
			// must not trigger another lance check; so the (4,2) unit must be untouched.
			const map = makeMap(6, 5)
			const attackerTile = tileXY(6, 1, 2)
			const targetTile = tileXY(6, 2, 2)
			const behindTile = tileXY(6, 3, 2)
			const farTile = tileXY(6, 4, 2)

			map.layers.units[attackerTile] = unit(LANCE_TANK, 0)
			map.layers.units[targetTile] = unit(STRIKE_COMMANDO, 1)
			map.layers.units[behindTile] = unit(STRIKE_COMMANDO, 1)
			const far = unit(STRIKE_COMMANDO, 1)
			const farInitial = far.health!
			map.layers.units[farTile] = far

			applyLancePassthrough(map, attackerTile, targetTile)

			expect(far.health).toBe(farInitial)
		})
	})
})
