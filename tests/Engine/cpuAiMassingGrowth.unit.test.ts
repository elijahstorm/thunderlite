// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { gameState, NEUTRAL_TEAM, type Player } from '../../src/lib/Engine/gameState'
import { reinforcementRate, massingPatience } from '../../src/lib/Engine/cpuAi/growth'
import { scorePositionBonus } from '../../src/lib/Engine/cpuAi/score'
import { unitData } from '../../src/lib/GameData/unit'

// The CPU masses before it pushes (see `localCommitment`), which is right only while
// reinforcements are actually coming. These tests pin the gate that tells the two
// situations apart: a funded factory means waiting improves the force ratio, an empty
// wallet on a factory-less map means waiting only lets the player pick the army apart.

const ANNIHILATOR = 7 // expensive heavy — the unit massing is supposed to protect
const WARFACTORY = 4 // actable
const GROUND_CONTROL = 1 // grants Capture.Allow_Ground
const CITY = 5 // income 60
const CPU = 1
const ENEMY = 0

const COLS = 14
const ROWS = 5
const at = (x: number, y: number) => x + y * COLS

const HOME = at(1, 2)
const FORWARD = at(8, 2) // inside SUPPORT_RADIUS of the enemy cluster
const ENEMY_A = at(10, 2)
const ENEMY_B = at(10, 1)
const ENEMY_C = at(10, 3)

const makeMap = (): MapObject =>
	({
		cols: COLS,
		rows: ROWS,
		layers: {
			ground: new Array(COLS * ROWS).fill(0).map(() => ({ type: 0, state: 0 })),
			sky: new Array(COLS * ROWS).fill(null),
			units: new Array(COLS * ROWS).fill(null),
			buildings: new Array(COLS * ROWS).fill(null),
		},
		highlights: [],
		route: [],
	}) as unknown as MapObject

const placeUnit = (map: MapObject, tile: number, type: number, team: number) => {
	map.layers.units[tile] = {
		type,
		state: 0,
		team,
		health: unitData[type].health,
	} as UnitObject
}

const placeBuilding = (map: MapObject, tile: number, type: number, team: number) => {
	map.layers.buildings[tile] = { type, team, state: 0 } as unknown as BuildingObject
}

const player = (team: number, money: number, ground = 1): Player => ({
	team,
	money,
	hasLost: false,
	controls: { ground, air: 0, sea: 0 },
})

const setPlayers = (...players: Player[]) => {
	gameState.set({
		players,
		currentTeam: CPU,
		turnNumber: 4,
		actedTiles: new Set<number>(),
		phase: 'playing',
	})
}

beforeEach(() => setPlayers())

describe('reinforcementRate', () => {
	it('is zero for a team that owns a factory but can never fund it', () => {
		const map = makeMap()
		placeBuilding(map, HOME, WARFACTORY, CPU)
		placeBuilding(map, at(1, 1), GROUND_CONTROL, CPU)
		setPlayers(player(CPU, 0))
		expect(reinforcementRate(map, CPU)).toBe(0)
	})

	it('is zero for a team with money but nowhere to spend it', () => {
		const map = makeMap()
		placeBuilding(map, at(1, 1), GROUND_CONTROL, CPU)
		setPlayers(player(CPU, 5000))
		expect(reinforcementRate(map, CPU)).toBe(0)
	})

	it('is positive once a funded factory exists', () => {
		const map = makeMap()
		placeBuilding(map, HOME, WARFACTORY, CPU)
		placeBuilding(map, at(1, 1), GROUND_CONTROL, CPU)
		setPlayers(player(CPU, 5000))
		expect(reinforcementRate(map, CPU)).toBeGreaterThan(0)
	})

	it('counts income from owned buildings, not just the bank', () => {
		const withCity = makeMap()
		placeBuilding(withCity, HOME, WARFACTORY, CPU)
		placeBuilding(withCity, at(1, 1), GROUND_CONTROL, CPU)
		placeBuilding(withCity, at(2, 1), CITY, CPU)
		const withoutCity = makeMap()
		placeBuilding(withoutCity, HOME, WARFACTORY, CPU)
		placeBuilding(withoutCity, at(1, 1), GROUND_CONTROL, CPU)
		setPlayers(player(CPU, 5000))
		expect(reinforcementRate(withCity, CPU)).toBeGreaterThan(reinforcementRate(withoutCity, CPU))
	})

	it('counts a telegraphed scripted drop even with no economy at all', () => {
		const map = makeMap()
		map.scheduledSpawns = [{ tile: HOME, team: CPU, unitType: ANNIHILATOR, unitName: '' }]
		setPlayers(player(CPU, 0))
		expect(reinforcementRate(map, CPU)).toBeGreaterThan(0)
	})

	it('credits a factory-less team that still has infantry and a factory to capture', () => {
		const map = makeMap()
		placeBuilding(map, at(6, 2), WARFACTORY, NEUTRAL_TEAM)
		placeUnit(map, HOME, 0 /* Strike Commando — capture-capable */, CPU)
		setPlayers(player(CPU, 0))
		expect(reinforcementRate(map, CPU)).toBeGreaterThan(0)
	})
})

describe('massingPatience', () => {
	const contested = (): MapObject => {
		const map = makeMap()
		placeBuilding(map, HOME, WARFACTORY, CPU)
		placeBuilding(map, at(1, 1), GROUND_CONTROL, CPU)
		return map
	}

	it('is 1 when nobody out-produces the CPU', () => {
		setPlayers(player(CPU, 5000), player(ENEMY, 0))
		expect(massingPatience(contested(), CPU)).toBe(1)
	})

	it('is 0 when the CPU cannot reinforce at all', () => {
		setPlayers(player(CPU, 0), player(ENEMY, 0))
		expect(massingPatience(contested(), CPU)).toBe(0)
	})

	it('falls between the two when the CPU is being out-produced', () => {
		const map = contested()
		placeBuilding(map, at(12, 1), WARFACTORY, ENEMY)
		placeBuilding(map, at(12, 3), GROUND_CONTROL, ENEMY)
		setPlayers(player(CPU, 1000), player(ENEMY, 9000))
		const patience = massingPatience(map, CPU)
		expect(patience).toBeGreaterThan(0)
		expect(patience).toBeLessThan(1)
	})

	it('ignores a team that has already lost', () => {
		const map = contested()
		placeBuilding(map, at(12, 1), WARFACTORY, ENEMY)
		placeBuilding(map, at(12, 3), GROUND_CONTROL, ENEMY)
		setPlayers(player(CPU, 1000), { ...player(ENEMY, 9000), hasLost: true })
		expect(massingPatience(map, CPU)).toBe(1)
	})
})

describe('massing gate on the advance', () => {
	// Same board both times — only the CPU's wallet changes — so every positional term
	// cancels and the difference is purely how much the massing gate holds it back.
	const scoreForward = (money: number): number => {
		const map = makeMap()
		placeBuilding(map, HOME, WARFACTORY, CPU)
		placeBuilding(map, at(1, 1), GROUND_CONTROL, CPU)
		placeUnit(map, ENEMY_A, ANNIHILATOR, ENEMY)
		placeUnit(map, ENEMY_B, ANNIHILATOR, ENEMY)
		placeUnit(map, ENEMY_C, ANNIHILATOR, ENEMY)
		setPlayers(player(CPU, money), player(ENEMY, 0))
		const mover = {
			type: ANNIHILATOR,
			state: 0,
			team: CPU,
			health: unitData[ANNIHILATOR].health,
		} as UnitObject
		return scorePositionBonus(map, FORWARD, mover, CPU)
	}

	it('a lone heavy pushes harder when no reinforcements are coming', () => {
		// Broke and factory-bound: holding cannot improve the ratio, so the CPU should
		// value the forward tile more than it does when a wave is on the way.
		expect(scoreForward(0)).toBeGreaterThan(scoreForward(5000))
	})
})
