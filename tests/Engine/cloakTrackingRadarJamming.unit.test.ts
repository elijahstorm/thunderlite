// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { get } from 'svelte/store'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { gameState, resetGameState } from '../../src/lib/Engine/gameState'
import { runModifiers } from '../../src/lib/Engine/modifiers'
import {
	cloak,
	hasAdjacentEnemy,
	revealCloakedAdjacentTo,
} from '../../src/lib/Engine/modifiers/cloak'
import { tracking } from '../../src/lib/Engine/modifiers/tracking'
import { radar, tilesInRange } from '../../src/lib/Engine/modifiers/radar'
import { computeJammedTiles, isJammedFor } from '../../src/lib/Engine/modifiers/jamming'
import { isUnitVisibleTo } from '../../src/lib/Engine/visibility'
import { pathFinder } from '../../src/lib/Engine/Interactor/Pathing/pathFinder'
import { generateMovementList } from '../../src/lib/Engine/Interactor/Pathing/movement'

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

const STEALTH_TANK = unitIndex('Stealth Tank')
const U_BOAT = unitIndex('U-Boat')
const STRIKE_COMMANDO = unitIndex('Strike Commando')
const HEAVY_COMMANDO = unitIndex('Heavy Commando')
const JAMMER_TRUCK = unitIndex('Jammer Truck')
const RAPTOR_FIGHTER = unitIndex('Raptor Fighter')
const SCORPION_TANK = unitIndex('Scorpion Tank')

const PLAINS = terrainIndex('Plains')

const ground = (type: number): GroundObject => ({ type, state: 0 })
const unit = (type: number, team = 0): UnitObject => ({ type, state: 0, team })

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

const runOn = (
	map: MapObject,
	tile: number,
	phase: 'End_Turn' | 'Move' | 'Start_Turn' | 'Idle' | 'Each_Turn'
) => {
	const u = map.layers.units[tile]
	if (!u) throw new Error(`no unit at tile ${tile}`)
	resetGameState()
	runModifiers(u, phase, {
		kind: 'unit',
		tile,
		state: get(gameState),
		map,
	})
}

describe('End_Turn.Cloak', () => {
	it('hides a Stealth Tank ending turn with no adjacent enemy', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.units[tile] = unit(STEALTH_TANK, 0)
		runOn(map, tile, 'End_Turn')
		expect(map.layers.units[tile]!.hidden).toBe(true)
	})

	it('leaves the Stealth Tank visible when an enemy is adjacent', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.units[tile] = unit(STEALTH_TANK, 0)
		map.layers.units[tile + 1] = unit(STRIKE_COMMANDO, 1)
		runOn(map, tile, 'End_Turn')
		expect(map.layers.units[tile]!.hidden).toBe(false)
	})

	it('ignores friendly adjacency when deciding whether to hide', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.units[tile] = unit(STEALTH_TANK, 0)
		map.layers.units[tile + 1] = unit(STRIKE_COMMANDO, 0)
		runOn(map, tile, 'End_Turn')
		expect(map.layers.units[tile]!.hidden).toBe(true)
	})

	it('hides a U-Boat the same way as a Stealth Tank', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.units[tile] = unit(U_BOAT, 0)
		runOn(map, tile, 'End_Turn')
		expect(map.layers.units[tile]!.hidden).toBe(true)
	})

	it('does not hide a non-cloaking unit', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.units[tile] = unit(SCORPION_TANK, 0)
		runOn(map, tile, 'End_Turn')
		expect(map.layers.units[tile]!.hidden).toBeFalsy()
	})

	it('runs the standalone handler directly', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		const u = unit(STEALTH_TANK, 0)
		map.layers.units[tile] = u
		cloak(u, { kind: 'unit', tile, state: get(gameState), map })
		expect(u.hidden).toBe(true)
	})

	it('hasAdjacentEnemy detects an enemy on each cardinal neighbor', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.units[tile - 1] = unit(STRIKE_COMMANDO, 1)
		expect(hasAdjacentEnemy(map, tile, 0)).toBe(true)
	})

	it('reveals a cloaked enemy when any unit (non-tracker) moves adjacent', () => {
		const map = makeMap(5, 5)
		const cloakedTile = 2 * 5 + 2
		const moverTile = cloakedTile + 1
		const cloaked = unit(STEALTH_TANK, 0)
		cloaked.hidden = true
		map.layers.units[cloakedTile] = cloaked
		map.layers.units[moverTile] = unit(SCORPION_TANK, 1)
		revealCloakedAdjacentTo(map, moverTile, 1)
		expect(cloaked.hidden).toBe(false)
	})

	it('does not reveal friendly cloaked units when an ally moves adjacent', () => {
		const map = makeMap(5, 5)
		const cloakedTile = 2 * 5 + 2
		const moverTile = cloakedTile + 1
		const cloaked = unit(STEALTH_TANK, 0)
		cloaked.hidden = true
		map.layers.units[cloakedTile] = cloaked
		map.layers.units[moverTile] = unit(SCORPION_TANK, 0)
		revealCloakedAdjacentTo(map, moverTile, 0)
		expect(cloaked.hidden).toBe(true)
	})
})

describe('Move.Tracking', () => {
	it('reveals an adjacent cloaked enemy when the tracker moves', () => {
		const map = makeMap(5, 5)
		const trackerTile = 2 * 5 + 2
		const enemyTile = trackerTile + 1
		map.layers.units[trackerTile] = unit(STRIKE_COMMANDO, 0)
		const enemy = unit(STEALTH_TANK, 1)
		enemy.hidden = true
		map.layers.units[enemyTile] = enemy
		runOn(map, trackerTile, 'Move')
		expect(map.layers.units[enemyTile]!.hidden).toBe(false)
	})

	it('does not affect non-cloaked enemies or friends', () => {
		const map = makeMap(5, 5)
		const trackerTile = 2 * 5 + 2
		map.layers.units[trackerTile] = unit(HEAVY_COMMANDO, 0)
		const friend = unit(STEALTH_TANK, 0)
		friend.hidden = true
		map.layers.units[trackerTile + 1] = friend
		const visibleEnemy = unit(SCORPION_TANK, 1)
		map.layers.units[trackerTile - 1] = visibleEnemy
		runOn(map, trackerTile, 'Move')
		expect(friend.hidden).toBe(true)
		expect(visibleEnemy.hidden).toBeFalsy()
	})

	it('runs the standalone tracking handler directly', () => {
		const map = makeMap(5, 5)
		const trackerTile = 2 * 5 + 2
		const enemyTile = trackerTile + 5
		const tracker = unit(STRIKE_COMMANDO, 0)
		map.layers.units[trackerTile] = tracker
		const enemy = unit(STEALTH_TANK, 1)
		enemy.hidden = true
		map.layers.units[enemyTile] = enemy
		tracking(tracker, {
			kind: 'unit',
			tile: trackerTile,
			state: get(gameState),
			map,
		})
		expect(enemy.hidden).toBe(false)
	})
})

describe('Move.Radar', () => {
	it('reveals cloaked enemies at distance 2 and 3 around the Jammer Truck', () => {
		const map = makeMap(9, 9)
		const center = 4 * 9 + 4
		map.layers.units[center] = unit(JAMMER_TRUCK, 0)

		const at2 = center + 2
		const at3 = center + 3
		const enemy2 = unit(STEALTH_TANK, 1)
		enemy2.hidden = true
		const enemy3 = unit(STEALTH_TANK, 1)
		enemy3.hidden = true
		map.layers.units[at2] = enemy2
		map.layers.units[at3] = enemy3

		runOn(map, center, 'Move')

		expect(enemy2.hidden).toBe(false)
		expect(enemy3.hidden).toBe(false)
	})

	it('does not reveal cloaked enemies at distance 1 or 4 (outside [2,3])', () => {
		const map = makeMap(11, 11)
		const center = 5 * 11 + 5
		map.layers.units[center] = unit(JAMMER_TRUCK, 0)

		const at1 = center + 1
		const at4 = center + 4
		const enemy1 = unit(STEALTH_TANK, 1)
		enemy1.hidden = true
		const enemy4 = unit(STEALTH_TANK, 1)
		enemy4.hidden = true
		map.layers.units[at1] = enemy1
		map.layers.units[at4] = enemy4

		runOn(map, center, 'Move')

		expect(enemy1.hidden).toBe(true)
		expect(enemy4.hidden).toBe(true)
	})

	it('runs the standalone radar handler directly', () => {
		const map = makeMap(9, 9)
		const center = 4 * 9 + 4
		const jammer = unit(JAMMER_TRUCK, 0)
		map.layers.units[center] = jammer
		const enemy = unit(STEALTH_TANK, 1)
		enemy.hidden = true
		map.layers.units[center + 2] = enemy
		radar(jammer, { kind: 'unit', tile: center, state: get(gameState), map })
		expect(enemy.hidden).toBe(false)
	})

	it('tilesInRange produces the manhattan annulus [min,max]', () => {
		const map = { cols: 7, rows: 7 } as const
		const center = 3 * 7 + 3
		const ring = new Set(tilesInRange(map, center, 2, 3))
		// the center and immediate neighbours must not appear
		expect(ring.has(center)).toBe(false)
		expect(ring.has(center + 1)).toBe(false)
		expect(ring.has(center - 1)).toBe(false)
		// dist=2 and dist=3 must appear
		expect(ring.has(center + 2)).toBe(true)
		expect(ring.has(center + 3)).toBe(true)
		expect(ring.has(center + 7 + 1)).toBe(true) // dist=2 diagonally
	})
})

describe('Idle.Jamming', () => {
	it('blocks an enemy Raptor Fighter from pathing through the Jammer Truck range', () => {
		const map = makeMap(9, 1)
		const jammerTile = 4
		map.layers.units[jammerTile] = unit(JAMMER_TRUCK, 0)
		const raptor = unit(RAPTOR_FIGHTER, 1)
		const route = pathFinder(map, raptor, 0, 8)
		expect(route).toEqual([])
	})

	it('does not block a friendly Raptor Fighter from pathing through', () => {
		const map = makeMap(9, 1)
		const jammerTile = 4
		map.layers.units[jammerTile] = unit(JAMMER_TRUCK, 0)
		const raptor = unit(RAPTOR_FIGHTER, 0)
		const route = pathFinder(map, raptor, 0, 8)
		expect(route.length).toBeGreaterThan(0)
	})

	it('does not block a ground enemy unit from pathing through', () => {
		const map = makeMap(9, 1)
		const jammerTile = 4
		map.layers.units[jammerTile] = unit(JAMMER_TRUCK, 0)
		// the jammer occupies tile 4 itself, so ground units can't pass through it,
		// but only because of the unit, not because of jamming.
		// Test jam tiles (3 and 5) are passable to ground units:
		const ground = unit(STRIKE_COMMANDO, 1)
		// Movement list of an enemy ground unit standing on tile 2 should include tile 3
		map.layers.units[2] = ground
		const movement = generateMovementList(map, 2, ground)
		expect(movement).toContain(3)
	})

	it('excludes jammed tiles from enemy air unit movement list', () => {
		const map = makeMap(9, 1)
		const jammerTile = 4
		map.layers.units[jammerTile] = unit(JAMMER_TRUCK, 0)
		const raptor = unit(RAPTOR_FIGHTER, 1)
		map.layers.units[0] = raptor
		const movement = generateMovementList(map, 0, raptor)
		// jammed tiles are 4±[2,3] = tiles 1, 2, 3, 5, 6, 7
		expect(movement).not.toContain(2)
		expect(movement).not.toContain(3)
	})

	it('computeJammedTiles produces the right annulus for the requesting team', () => {
		const map = makeMap(9, 9)
		const center = 4 * 9 + 4
		map.layers.units[center] = unit(JAMMER_TRUCK, 0)
		const jammed = computeJammedTiles(map, 1)
		expect(jammed.has(center + 2)).toBe(true)
		expect(jammed.has(center + 3)).toBe(true)
		expect(jammed.has(center)).toBe(false)
		expect(jammed.has(center + 1)).toBe(false)
		expect(jammed.has(center + 4)).toBe(false)

		// friendly team should not be jammed by their own jammer
		const own = computeJammedTiles(map, 0)
		expect(own.size).toBe(0)
	})

	it('isJammedFor returns true only at distances 2..3 for the enemy team', () => {
		const map = makeMap(9, 9)
		const center = 4 * 9 + 4
		map.layers.units[center] = unit(JAMMER_TRUCK, 0)
		expect(isJammedFor(map, center + 2, 1)).toBe(true)
		expect(isJammedFor(map, center + 3, 1)).toBe(true)
		expect(isJammedFor(map, center + 1, 1)).toBe(false)
		expect(isJammedFor(map, center + 4, 1)).toBe(false)
		expect(isJammedFor(map, center + 2, 0)).toBe(false)
	})
})

describe('isUnitVisibleTo', () => {
	it('returns true for friendly units regardless of hidden flag', () => {
		const u = unit(STEALTH_TANK, 0)
		u.hidden = true
		expect(isUnitVisibleTo(u, 0)).toBe(true)
	})

	it('returns false for hidden enemy units', () => {
		const u = unit(STEALTH_TANK, 0)
		u.hidden = true
		expect(isUnitVisibleTo(u, 1)).toBe(false)
	})

	it('returns true for visible enemy units', () => {
		const u = unit(SCORPION_TANK, 0)
		expect(isUnitVisibleTo(u, 1)).toBe(true)
	})
})
