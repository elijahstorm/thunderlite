// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import {
	generateMovementList,
	truncateRouteAtCollision,
} from '../../src/lib/Engine/Interactor/Pathing/movement'
import { pathFinder } from '../../src/lib/Engine/Interactor/Pathing/pathFinder'
import { generateAttackList } from '../../src/lib/Engine/Interactor/Pathing/attack'
import { generatePlansFor } from '../../src/lib/Engine/cpuAi/candidates'
import {
	concealedEnemyTiles,
	isStealthUnit,
	isUnitStealthed,
} from '../../src/lib/Engine/visibility'
import { fogOfWarEnabled } from '../../src/lib/Engine/fogState'
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

const PLAINS = terrainIndex('Plains')

const STRIKE_COMMANDO = unitIndex('Strike Commando') // movement 3, sight 2, not stealth
const STEALTH_TANK = unitIndex('Stealth Tank')
const U_BOAT = unitIndex('U-Boat')
const ROCKET_TRUCK = unitIndex('Rocket Truck') // indirect, range [3,5]
const SCORPION_TANK = unitIndex('Scorpion Tank') // direct ground bruiser

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

afterEach(() => {
	fogOfWarEnabled.set(false)
})

describe('isStealthUnit', () => {
	it('flags Stealth Tank and U-Boat, not ordinary units', () => {
		expect(isStealthUnit(unit(STEALTH_TANK))).toBe(true)
		expect(isStealthUnit(unit(U_BOAT))).toBe(true)
		expect(isStealthUnit(unit(STRIKE_COMMANDO))).toBe(false)
	})
})

describe('isUnitStealthed', () => {
	it('is true for a stealth unit with no enemy adjacent', () => {
		const map = makeMap(5, 1)
		map.layers.units[2] = unit(STEALTH_TANK, 1)
		expect(isUnitStealthed(map, 2, map.layers.units[2]!)).toBe(true)
	})

	it('is false once an enemy stands adjacent (flushed out)', () => {
		const map = makeMap(5, 1)
		map.layers.units[2] = unit(STEALTH_TANK, 1)
		map.layers.units[1] = unit(STRIKE_COMMANDO, 0)
		expect(isUnitStealthed(map, 2, map.layers.units[2]!)).toBe(false)
	})

	it('honors the hidden flag for non-stealth units (sky cloak)', () => {
		const map = makeMap(5, 1)
		const u = unit(STRIKE_COMMANDO, 1)
		u.hidden = true
		map.layers.units[2] = u
		expect(isUnitStealthed(map, 2, u)).toBe(true)
	})
})

describe('generateAttackList concealment filter', () => {
	it('drops a concealed stealth enemy from a ranged attacker (fog off)', () => {
		const map = makeMap(7, 1)
		const rocket = unit(ROCKET_TRUCK, 0)
		map.layers.units[0] = rocket
		map.layers.units[3] = unit(STEALTH_TANK, 1) // in range [3,5], no friendly adjacent → cloaked
		expect(generateAttackList(map, 0, rocket)).not.toContain(3)
	})

	it('lists the same enemy once a friendly reveals it by standing adjacent', () => {
		const map = makeMap(7, 1)
		const rocket = unit(ROCKET_TRUCK, 0)
		map.layers.units[0] = rocket
		map.layers.units[3] = unit(STEALTH_TANK, 1)
		map.layers.units[2] = unit(STRIKE_COMMANDO, 0) // adjacent to the stealth tank → flushed out
		expect(generateAttackList(map, 0, rocket)).toContain(3)
	})

	it('still lists ordinary (non-cloaked) enemies in range', () => {
		const map = makeMap(7, 1)
		const rocket = unit(ROCKET_TRUCK, 0)
		map.layers.units[0] = rocket
		map.layers.units[3] = unit(STRIKE_COMMANDO, 1)
		expect(generateAttackList(map, 0, rocket)).toContain(3)
	})
})

describe('CPU planner is blind to concealed enemies', () => {
	it('plans no attack on a stealth enemy it cannot perceive', () => {
		const map = makeMap(5, 1)
		map.layers.units[0] = unit(SCORPION_TANK, 1) // CPU
		map.layers.units[2] = unit(STEALTH_TANK, 0) // player stealth, no CPU unit adjacent → cloaked
		const plans = generatePlansFor(map, 0, map.layers.units[0]!, 1)
		const attacksStealth = plans.some(
			(p) => p.kind === 'attack' && p.actions.some((a) => a.kind === 'attack' && a.to === 2)
		)
		expect(attacksStealth).toBe(false)
	})

	it('plans the attack once the stealth enemy is revealed', () => {
		const map = makeMap(5, 1)
		map.layers.units[0] = unit(SCORPION_TANK, 1) // CPU
		map.layers.units[2] = unit(STEALTH_TANK, 0) // player stealth
		map.layers.units[3] = unit(SCORPION_TANK, 1) // CPU unit adjacent to the stealth → reveals it
		const plans = generatePlansFor(map, 0, map.layers.units[0]!, 1)
		const attacksStealth = plans.some(
			(p) => p.kind === 'attack' && p.actions.some((a) => a.kind === 'attack' && a.to === 2)
		)
		expect(attacksStealth).toBe(true)
	})
})

describe('concealedEnemyTiles', () => {
	it('treats a stealth enemy as concealed with fog off when no enemy is adjacent', () => {
		const map = makeMap(7, 1)
		map.layers.units[3] = unit(STEALTH_TANK, 1)
		expect(concealedEnemyTiles(map, 0).has(3)).toBe(true)
	})

	it('reveals a stealth enemy once an observing unit stands adjacent', () => {
		const map = makeMap(7, 1)
		map.layers.units[3] = unit(STEALTH_TANK, 1)
		map.layers.units[2] = unit(STRIKE_COMMANDO, 0)
		expect(concealedEnemyTiles(map, 0).has(3)).toBe(false)
	})

	it('does not conceal an ordinary visible enemy with fog off', () => {
		const map = makeMap(7, 1)
		map.layers.units[3] = unit(STRIKE_COMMANDO, 1)
		expect(concealedEnemyTiles(map, 0).has(3)).toBe(false)
	})

	it('conceals an enemy carrying the hidden flag (sky cloak) regardless of fog', () => {
		const map = makeMap(7, 1)
		const hidden = unit(STRIKE_COMMANDO, 1)
		hidden.hidden = true
		map.layers.units[3] = hidden
		expect(concealedEnemyTiles(map, 0).has(3)).toBe(true)
	})

	it('conceals enemies outside the team sight diamond when fog is on', () => {
		fogOfWarEnabled.set(true)
		const map = makeMap(9, 1)
		map.layers.units[0] = unit(STRIKE_COMMANDO, 0) // sight 2 -> sees 0,1,2
		const near = unit(STRIKE_COMMANDO, 1)
		const far = unit(STRIKE_COMMANDO, 1)
		map.layers.units[2] = near // inside sight
		map.layers.units[6] = far // outside sight
		const concealed = concealedEnemyTiles(map, 0)
		expect(concealed.has(2)).toBe(false)
		expect(concealed.has(6)).toBe(true)
	})
})

describe('pathFinder ghosting through concealed enemies', () => {
	it('cannot route through an enemy when no concealed set is supplied', () => {
		const map = makeMap(5, 1)
		map.layers.units[2] = unit(STRIKE_COMMANDO, 1)
		const mover = unit(STRIKE_COMMANDO, 0)
		expect(pathFinder(map, mover, 0, 3)).toEqual([])
	})

	it('routes straight through a concealed enemy as if the tile were empty', () => {
		const map = makeMap(5, 1)
		map.layers.units[2] = unit(STEALTH_TANK, 1)
		const mover = unit(STRIKE_COMMANDO, 0)
		const concealed = concealedEnemyTiles(map, 0)
		const route = pathFinder(map, mover, 0, 3, concealed)
		expect(route).toEqual([0, 1, 2, 3])
	})
})

describe('generateMovementList ghosting', () => {
	it('stops at a visible enemy without a concealed set', () => {
		const map = makeMap(5, 1)
		map.layers.units[2] = unit(STRIKE_COMMANDO, 1)
		const reachable = generateMovementList(map, 0, unit(STRIKE_COMMANDO, 0))
		expect(reachable).toContain(1)
		expect(reachable).not.toContain(2)
		expect(reachable).not.toContain(3)
	})

	it('flows past a concealed enemy and keeps its tile as a selectable destination', () => {
		const map = makeMap(5, 1)
		map.layers.units[2] = unit(STEALTH_TANK, 1)
		const mover = unit(STRIKE_COMMANDO, 0)
		const reachable = generateMovementList(map, 0, mover, concealedEnemyTiles(map, 0))
		expect(reachable).toContain(2) // the hidden enemy's tile reads as empty
		expect(reachable).toContain(3) // and the path continues beyond it
	})
})

describe('truncateRouteAtCollision', () => {
	it('returns a clear route unchanged', () => {
		const map = makeMap(5, 1)
		expect(truncateRouteAtCollision(map, [0, 1, 2, 3], 0)).toEqual({
			route: [0, 1, 2, 3],
			collided: false,
		})
	})

	it('halts on the tile before the first enemy in the route', () => {
		const map = makeMap(5, 1)
		map.layers.units[2] = unit(STEALTH_TANK, 1)
		expect(truncateRouteAtCollision(map, [0, 1, 2, 3], 0)).toEqual({
			route: [0, 1],
			collided: true,
		})
	})

	it('flags an immediate collision (enemy adjacent to the start) with no movement', () => {
		const map = makeMap(5, 1)
		map.layers.units[1] = unit(STEALTH_TANK, 1)
		expect(truncateRouteAtCollision(map, [0, 1, 2], 0)).toEqual({
			route: [0],
			collided: true,
		})
	})

	it('ignores friendly units sharing the route', () => {
		const map = makeMap(5, 1)
		map.layers.units[2] = unit(STRIKE_COMMANDO, 0)
		expect(truncateRouteAtCollision(map, [0, 1, 2, 3], 0)).toEqual({
			route: [0, 1, 2, 3],
			collided: false,
		})
	})
})
