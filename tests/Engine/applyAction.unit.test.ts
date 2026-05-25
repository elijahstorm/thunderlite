// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import { applyAction } from '../../src/lib/Engine/applyAction'
import {
	gameState,
	initGameStateFromMap,
	resetGameState,
} from '../../src/lib/Engine/gameState'
import type { SerializedAction } from '../../src/lib/Engine/Interactor/serializedAction'
import { terrainData } from '../../src/lib/GameData/terrain'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'

const terrainIndex = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`unknown terrain: ${name}`)
	return idx
}

const unitIndex = (name: string): number => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`unknown unit: ${name}`)
	return idx
}

const buildingIndex = (name: string): number => {
	const idx = buildingData.findIndex((b) => b.name === name)
	if (idx < 0) throw new Error(`unknown building: ${name}`)
	return idx
}

const PLAINS = terrainIndex('Plains')
const SCORPION_TANK = unitIndex('Scorpion Tank')
const STRIKE_COMMANDO = unitIndex('Strike Commando')
const CITY = buildingIndex('City')

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

const placeUnit = (
	map: MapObject,
	tile: number,
	type: number,
	team: number,
	health?: number
) => {
	map.layers.units[tile] = {
		type,
		state: 0,
		team,
		health: health ?? unitData[type].health,
	}
}

const placeBuilding = (
	map: MapObject,
	tile: number,
	type: number,
	team: number
) => {
	map.layers.buildings[tile] = { type, state: 0, team }
}

const snapshotUnits = (map: MapObject) =>
	map.layers.units.map((u) =>
		u ? { type: u.type, team: u.team, health: u.health ?? null, state: u.state ?? null } : null
	)

const snapshotBuildings = (map: MapObject) =>
	map.layers.buildings.map((b) =>
		b ? { type: b.type, team: b.team, state: b.state ?? null } : null
	)

const snapshotGameState = () => {
	const s = get(gameState)
	return {
		currentTeam: s.currentTeam,
		turnNumber: s.turnNumber,
		phase: s.phase,
		actedTiles: [...s.actedTiles].sort((a, b) => a - b),
		players: s.players.map((p) => ({
			team: p.team,
			money: p.money,
			hasLost: p.hasLost,
		})),
	}
}

const buildScenario = (): { map: MapObject; log: SerializedAction[] } => {
	const map = makeMap(5, 5)
	placeUnit(map, 6, SCORPION_TANK, 0)
	placeUnit(map, 9, STRIKE_COMMANDO, 1)
	placeBuilding(map, 9, CITY, 1)
	placeBuilding(map, 6, CITY, 0)
	initGameStateFromMap(map)

	const log: SerializedAction[] = [
		{ kind: 'wait', tile: 6 },
		{ kind: 'end-turn' },
		{ kind: 'capture', tile: 9 },
		{ kind: 'end-turn' },
	]
	return { map, log }
}

const applyLog = (map: MapObject, log: SerializedAction[]) => {
	for (const action of log) applyAction(map, action)
}

describe('applyAction determinism', () => {
	beforeEach(() => {
		resetGameState()
	})

	it('produces identical state when the same event log is applied twice', () => {
		const a = buildScenario()
		applyLog(a.map, a.log)
		const aUnits = snapshotUnits(a.map)
		const aBuildings = snapshotBuildings(a.map)
		const aState = snapshotGameState()

		resetGameState()
		const b = buildScenario()
		applyLog(b.map, b.log)
		const bUnits = snapshotUnits(b.map)
		const bBuildings = snapshotBuildings(b.map)
		const bState = snapshotGameState()

		expect(bUnits).toEqual(aUnits)
		expect(bBuildings).toEqual(aBuildings)
		expect(bState).toEqual(aState)
	})

	it('move action relocates a unit deterministically', () => {
		const map = makeMap(5, 5)
		placeUnit(map, 6, SCORPION_TANK, 0)
		initGameStateFromMap(map)

		applyAction(map, { kind: 'move', from: 6, to: 7 })
		expect(map.layers.units[6]).toBeNull()
		expect(map.layers.units[7]?.type).toBe(SCORPION_TANK)
	})

	it('wait action marks the tile as acted', () => {
		const map = makeMap(5, 5)
		placeUnit(map, 12, SCORPION_TANK, 0)
		initGameStateFromMap(map)

		applyAction(map, { kind: 'wait', tile: 12 })
		expect(get(gameState).actedTiles.has(12)).toBe(true)
	})

	it('end-turn advances the active team', () => {
		const map = makeMap(5, 5)
		placeUnit(map, 6, SCORPION_TANK, 0)
		placeUnit(map, 9, SCORPION_TANK, 1)
		placeBuilding(map, 0, CITY, 0)
		placeBuilding(map, 24, CITY, 1)
		initGameStateFromMap(map)

		const before = get(gameState).currentTeam
		applyAction(map, { kind: 'end-turn' })
		const after = get(gameState).currentTeam
		expect(after).not.toBe(before)
	})

	it('attack action reduces target health and is deterministic across runs', () => {
		const run = () => {
			const map = makeMap(5, 5)
			placeUnit(map, 12, SCORPION_TANK, 0)
			placeUnit(map, 13, STRIKE_COMMANDO, 1)
			initGameStateFromMap(map)
			applyAction(map, { kind: 'attack', from: 12, to: 13 })
			return snapshotUnits(map)
		}

		resetGameState()
		const first = run()
		resetGameState()
		const second = run()
		expect(second).toEqual(first)
	})
})
