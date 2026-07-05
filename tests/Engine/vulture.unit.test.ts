// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { gameState, resetGameState, markTileActed } from '../../src/lib/Engine/gameState'
import { applyVultureKill } from '../../src/lib/Engine/modifiers/vulture'
import { applyAction } from '../../src/lib/Engine/applyAction'
import { terrainData } from '../../src/lib/GameData/terrain'
import { unitData } from '../../src/lib/GameData/unit'

const VULTURE_TYPE = unitData.findIndex((u) => u.name === 'Vulture Drone')
const NON_VULTURE_TYPE = unitData.findIndex((u) => u.name === 'Strike Commando')
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')

const makeVulture = (team = 0): UnitObject => ({
	type: VULTURE_TYPE,
	state: 0,
	team,
})

const makeNonVulture = (team = 0): UnitObject => ({
	type: NON_VULTURE_TYPE,
	state: 0,
	team,
})

const makeMap = (cols: number, rows: number): MapObject =>
	({
		cols,
		rows,
		layers: {
			ground: new Array(cols * rows).fill(0).map(() => ({ type: PLAINS, state: 0 })),
			sky: new Array(cols * rows).fill(null),
			units: new Array(cols * rows).fill(null),
			buildings: new Array(cols * rows).fill(null),
		},
		highlights: [],
		route: [],
		filters: {} as never,
	}) as MapObject

const placeUnit = (map: MapObject, tile: number, type: number, team: number, health?: number) => {
	map.layers.units[tile] = { type, state: 0, team, health: health ?? unitData[type].health }
}

describe('Vulture — act again on kill', () => {
	beforeEach(() => {
		resetGameState()
	})

	it('sanity: lookup of Vulture Drone in unit data is valid', () => {
		expect(VULTURE_TYPE).toBeGreaterThanOrEqual(0)
		expect(unitData[VULTURE_TYPE].modifiers).toContain('End_Turn.Vulture')
	})

	it('on kill, un-acts the Vulture so it can be selected again this turn', () => {
		const vulture = makeVulture()
		const tile = 5
		markTileActed(tile)
		expect(get(gameState).actedTiles.has(tile)).toBe(true)

		const granted = applyVultureKill(vulture, tile)

		expect(granted).toBe(true)
		expect(get(gameState).actedTiles.has(tile)).toBe(false)
	})

	it('does nothing for non-Vulture units (target survived path is unaffected)', () => {
		const grunt = makeNonVulture()
		const tile = 3
		markTileActed(tile)

		const granted = applyVultureKill(grunt, tile)

		expect(granted).toBe(false)
		expect(get(gameState).actedTiles.has(tile)).toBe(true)
	})

	it('chains: every kill in the same turn re-grants the bonus', () => {
		const vulture = makeVulture()

		// First kill at tile 5, second at tile 8, third at tile 2 — each one refreshes.
		for (const tile of [5, 8, 2]) {
			markTileActed(tile)
			expect(applyVultureKill(vulture, tile)).toBe(true)
			expect(get(gameState).actedTiles.has(tile)).toBe(false)
		}
	})
})

describe('Vulture — through the real applyAction attack path', () => {
	beforeEach(() => {
		resetGameState()
	})

	it('kill: attack that destroys the target leaves the vulture un-acted', () => {
		const map = makeMap(6, 1)
		placeUnit(map, 2, VULTURE_TYPE, 0)
		placeUnit(map, 3, NON_VULTURE_TYPE, 1, 1) // 1 HP, guaranteed kill

		applyAction(map, { kind: 'attack', from: 2, to: 3 })

		expect(map.layers.units[3]).toBeNull()
		expect(get(gameState).actedTiles.has(2)).toBe(false)
	})

	it('no kill: attack that leaves the target alive marks the vulture acted', () => {
		const map = makeMap(6, 1)
		placeUnit(map, 2, VULTURE_TYPE, 0)
		placeUnit(map, 3, NON_VULTURE_TYPE, 1) // full HP, survives

		applyAction(map, { kind: 'attack', from: 2, to: 3 })

		expect(map.layers.units[3]).not.toBeNull()
		expect(get(gameState).actedTiles.has(2)).toBe(true)
	})

	it('move-then-kill (interactor shape): move commit then attack commit, tile ends un-acted', () => {
		const map = makeMap(6, 1)
		placeUnit(map, 0, VULTURE_TYPE, 0)
		placeUnit(map, 3, NON_VULTURE_TYPE, 1, 1)

		applyAction(map, { kind: 'move', from: 0, to: 2 })
		expect(get(gameState).actedTiles.has(2)).toBe(true) // moved = acted

		applyAction(map, { kind: 'attack', from: 2, to: 3 })

		expect(map.layers.units[3]).toBeNull()
		expect(get(gameState).actedTiles.has(2)).toBe(false) // freed again after the kill
	})

	it('chains kills across multiple attacks in the same turn', () => {
		const map = makeMap(6, 1)
		placeUnit(map, 2, VULTURE_TYPE, 0)
		placeUnit(map, 3, NON_VULTURE_TYPE, 1, 1)
		placeUnit(map, 1, NON_VULTURE_TYPE, 1, 1)

		applyAction(map, { kind: 'attack', from: 2, to: 3 })
		expect(map.layers.units[3]).toBeNull()
		expect(get(gameState).actedTiles.has(2)).toBe(false)

		applyAction(map, { kind: 'attack', from: 2, to: 1 })
		expect(map.layers.units[1]).toBeNull()
		expect(get(gameState).actedTiles.has(2)).toBe(false) // still free — the chain continues
	})
})
