// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { validTerrain } from '../../src/lib/Engine/Interactor/Pathing/movement'
import { pathFinder } from '../../src/lib/Engine/Interactor/Pathing/pathFinder'
import { terrainData } from '../../src/lib/GameData/terrain'
import { unitData } from '../../src/lib/GameData/unit'

const terrainIndex = (name: string) => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`unknown terrain: ${name}`)
	return idx
}

const unitIndex = (name: string) => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`unknown unit: ${name}`)
	return idx
}

const VOLCANO = terrainIndex('Volcano')
const PLAINS = terrainIndex('Plains')
const SEA = terrainIndex('Sea')
const SHORE = terrainIndex('Shore')
const MOUNTAIN = terrainIndex('Mountain')

const RAPTOR_FIGHTER = unitIndex('Raptor Fighter')
const STRIKE_COMMANDO = unitIndex('Strike Commando')
const CORVETTE = unitIndex('Corvette')

const ground = (type: number): GroundObject => ({ type, state: 0 })
const unit = (type: number, team = 0): UnitObject => ({ type, state: 0, team })

const makeMap = (cols: number, rows: number, groundTypes: number[]): MapObject => {
	if (groundTypes.length !== cols * rows) {
		throw new Error(`map size mismatch: expected ${cols * rows}, got ${groundTypes.length}`)
	}
	return {
		cols,
		rows,
		layers: {
			ground: groundTypes.map((t) => ground(t)),
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
	}
}

describe('validTerrain', () => {
	it('blocks air units from impassable terrain (Volcano)', () => {
		expect(validTerrain(ground(VOLCANO), unit(RAPTOR_FIGHTER))).toBe(false)
	})

	it('allows air units to enter ordinary land terrain', () => {
		expect(validTerrain(ground(PLAINS), unit(RAPTOR_FIGHTER))).toBe(true)
	})

	it('allows air units to cross sea and shore tiles', () => {
		expect(validTerrain(ground(SEA), unit(RAPTOR_FIGHTER))).toBe(true)
		expect(validTerrain(ground(SHORE), unit(RAPTOR_FIGHTER))).toBe(true)
	})

	it('blocks every unit type from Volcano tiles', () => {
		expect(validTerrain(ground(VOLCANO), unit(STRIKE_COMMANDO))).toBe(false)
		expect(validTerrain(ground(VOLCANO), unit(CORVETTE))).toBe(false)
	})

	it('keeps ground units on land and off sea', () => {
		expect(validTerrain(ground(PLAINS), unit(STRIKE_COMMANDO))).toBe(true)
		expect(validTerrain(ground(MOUNTAIN), unit(STRIKE_COMMANDO))).toBe(true)
		expect(validTerrain(ground(SEA), unit(STRIKE_COMMANDO))).toBe(false)
	})

	it('keeps sea units on water/shore and off land', () => {
		expect(validTerrain(ground(SEA), unit(CORVETTE))).toBe(true)
		expect(validTerrain(ground(SHORE), unit(CORVETTE))).toBe(true)
		expect(validTerrain(ground(PLAINS), unit(CORVETTE))).toBe(false)
	})
})

describe('pathFinder + volcano air-block', () => {
	it('refuses to route an air unit through a Volcano blocking the only path', () => {
		// Row of 5 tiles. A wall of Volcanoes occupies the middle column.
		const cols = 5
		const rows = 1
		const tiles = [PLAINS, PLAINS, VOLCANO, PLAINS, PLAINS]
		const map = makeMap(cols, rows, tiles)
		const raptor = unit(RAPTOR_FIGHTER)
		const route = pathFinder(map, raptor, 0, 4)
		expect(route).toEqual([])
	})

	it('routes an air unit through clear terrain', () => {
		const cols = 5
		const rows = 1
		const tiles = [PLAINS, PLAINS, PLAINS, PLAINS, PLAINS]
		const map = makeMap(cols, rows, tiles)
		const raptor = unit(RAPTOR_FIGHTER)
		const route = pathFinder(map, raptor, 0, 4)
		expect(route.length).toBeGreaterThan(0)
		expect(route[route.length - 1]).toBe(4)
	})
})
