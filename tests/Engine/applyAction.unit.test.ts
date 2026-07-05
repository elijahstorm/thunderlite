// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import { applyAction } from '../../src/lib/Engine/applyAction'
import { gameState, initGameStateFromMap, resetGameState } from '../../src/lib/Engine/gameState'
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
const STEALTH_TANK = unitIndex('Stealth Tank')
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

const placeUnit = (map: MapObject, tile: number, type: number, team: number, health?: number) => {
	map.layers.units[tile] = {
		type,
		state: 0,
		team,
		health: health ?? unitData[type].health,
	}
}

const placeBuilding = (map: MapObject, tile: number, type: number, team: number) => {
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

	it('splash only washes over unit types the attacker could target directly', () => {
		const SCORCHER = unitIndex('Scorcher')
		const RAPTOR_FIGHTER = unitIndex('Raptor Fighter')
		const map = makeMap(5, 5)
		placeUnit(map, 12, SCORCHER, 0)
		placeUnit(map, 13, STRIKE_COMMANDO, 1) // primary target
		placeUnit(map, 8, RAPTOR_FIGHTER, 1) // air unit beside the target — flame passes under it
		placeUnit(map, 18, STRIKE_COMMANDO, 1) // ground unit beside the target — catches the wash
		initGameStateFromMap(map)

		applyAction(map, { kind: 'attack', from: 12, to: 13 })

		const raptorMax = unitData[RAPTOR_FIGHTER].health
		const groundMax = unitData[STRIKE_COMMANDO].health
		expect(map.layers.units[8]?.health ?? raptorMax).toBe(raptorMax)
		expect(map.layers.units[18]?.health ?? groundMax).toBeLessThan(groundMax)
	})

	it('splash is indiscriminate: it scorches the attacker’s own units caught in the wash', () => {
		const SCORCHER = unitIndex('Scorcher')
		const map = makeMap(5, 5)
		placeUnit(map, 12, SCORCHER, 0)
		placeUnit(map, 13, STRIKE_COMMANDO, 1) // primary target (enemy)
		placeUnit(map, 18, STRIKE_COMMANDO, 0) // FRIENDLY ground unit beside the target
		initGameStateFromMap(map)

		const friendlyMax = unitData[STRIKE_COMMANDO].health
		applyAction(map, { kind: 'attack', from: 12, to: 13 })

		// The attacker's own adjacent unit takes the wash exactly as an enemy would.
		expect(map.layers.units[18]?.health ?? friendlyMax).toBeLessThan(friendlyMax)
	})

	it('splash spares a friendly air unit the ground attacker could never target', () => {
		const SCORCHER = unitIndex('Scorcher')
		const RAPTOR_FIGHTER = unitIndex('Raptor Fighter')
		const map = makeMap(5, 5)
		placeUnit(map, 12, SCORCHER, 0)
		placeUnit(map, 13, STRIKE_COMMANDO, 1) // primary target (enemy)
		placeUnit(map, 8, RAPTOR_FIGHTER, 0) // FRIENDLY air unit beside the target
		initGameStateFromMap(map)

		const raptorMax = unitData[RAPTOR_FIGHTER].health
		applyAction(map, { kind: 'attack', from: 12, to: 13 })

		// The flame passes under an ally flyer the same way it passes under an enemy one.
		expect(map.layers.units[8]?.health ?? raptorMax).toBe(raptorMax)
	})

	it('Attack.Burn scorches forest at commit, but leaves it for the reveal when deferBurn is set', () => {
		const SCORCHER = unitIndex('Scorcher')
		const FOREST = terrainIndex('Forest')
		const CHARRED = terrainIndex('Charred Forest')

		// Instant path (headless / replay): the commit scorches the struck forest.
		const instant = makeMap(5, 5)
		instant.layers.ground[13] = { type: FOREST, state: 0 }
		placeUnit(instant, 12, SCORCHER, 0)
		placeUnit(instant, 13, STRIKE_COMMANDO, 1)
		initGameStateFromMap(instant)
		applyAction(instant, { kind: 'attack', from: 12, to: 13 })
		expect(instant.layers.ground[13].type).toBe(CHARRED)

		// Deferred path (animated): the commit leaves the swap to the burn-materialize
		// reveal, so the tile is still forest right after the commit.
		const deferred = makeMap(5, 5)
		deferred.layers.ground[13] = { type: FOREST, state: 0 }
		placeUnit(deferred, 12, SCORCHER, 0)
		placeUnit(deferred, 13, STRIKE_COMMANDO, 1)
		initGameStateFromMap(deferred)
		applyAction(deferred, { kind: 'attack', from: 12, to: 13 }, { deferBurn: true })
		expect(deferred.layers.ground[13].type).toBe(FOREST)
	})

	it('a melee splash attacker never scorches its own tile', () => {
		// The Scorcher fires point-blank, so its own tile is adjacent to the target.
		// The wash must skip the firing tile — a unit does not splash itself. The
		// target is one-shot (1 HP) so it dies and cannot counter, isolating the
		// splash: any HP the Scorcher loses here could only be self-inflicted.
		const SCORCHER = unitIndex('Scorcher')
		const map = makeMap(5, 5)
		placeUnit(map, 12, SCORCHER, 0)
		placeUnit(map, 13, STRIKE_COMMANDO, 1, 1)
		initGameStateFromMap(map)

		const scorcherMax = unitData[SCORCHER].health
		applyAction(map, { kind: 'attack', from: 12, to: 13 })

		expect(map.layers.units[13]).toBeNull() // target one-shot, so no counter
		expect(map.layers.units[12]?.health ?? 0).toBe(scorcherMax)
	})

	it('a stealth attacker that leaves its target alive is revealed (drops its cloak)', () => {
		const map = makeMap(5, 5)
		const attackerTile = 12
		placeUnit(map, attackerTile, STEALTH_TANK, 0) // hidden flag undefined = still cloaked
		placeUnit(map, 13, SCORPION_TANK, 1) // tanky enough to survive the hit
		initGameStateFromMap(map)
		applyAction(map, { kind: 'attack', from: attackerTile, to: 13 })

		const attacker = map.layers.units[attackerTile]
		expect(attacker?.type).toBe(STEALTH_TANK) // it survived the counter
		expect(map.layers.units[13]?.type).toBe(SCORPION_TANK) // target survived
		expect(attacker?.hidden).toBe(false) // firing without a kill exposes it
	})

	it('a stealth attacker that kills its target keeps its cloak (no witness)', () => {
		const map = makeMap(5, 5)
		const attackerTile = 12
		const attacker = {
			type: STEALTH_TANK,
			state: 0,
			team: 0,
			health: unitData[STEALTH_TANK].health,
			hidden: true,
		}
		map.layers.units[attackerTile] = attacker
		placeUnit(map, 13, STRIKE_COMMANDO, 1, 1) // 1 HP — one shot kills it
		initGameStateFromMap(map)
		applyAction(map, { kind: 'attack', from: attackerTile, to: 13 })

		expect(map.layers.units[13]).toBeNull() // target dead
		// Cloak untouched by the attack: a silent kill leaves it hidden.
		expect(map.layers.units[attackerTile]?.hidden).toBe(true)
	})

	it('attacking flags a capture-capable unit so it skips next turn’s capture', () => {
		const map = makeMap(5, 5)
		placeUnit(map, 12, STRIKE_COMMANDO, 0)
		placeUnit(map, 13, STRIKE_COMMANDO, 1)
		initGameStateFromMap(map)

		applyAction(map, { kind: 'attack', from: 12, to: 13 })
		expect(map.layers.units[12]?.attacked).toBe(true)
	})

	it('a capturing unit killed in combat resets the building it stood on to full', () => {
		const map = makeMap(5, 5)
		placeUnit(map, 12, SCORPION_TANK, 0)
		placeUnit(map, 13, STRIKE_COMMANDO, 1, 1) // 1 HP — one shot kills it
		placeBuilding(map, 13, CITY, 0) // enemy (team 0) building under the team-1 commando
		const max = buildingData[CITY].stature
		map.layers.buildings[13]!.stature = max - 10 // mid-capture by the commando
		initGameStateFromMap(map)

		applyAction(map, { kind: 'attack', from: 12, to: 13 })
		expect(map.layers.units[13]).toBeNull() // defender died
		expect(map.layers.buildings[13]?.stature).toBe(max)
	})

	it('moving off a partially-captured enemy building resets its stature to full', () => {
		const map = makeMap(5, 5)
		placeUnit(map, 12, STRIKE_COMMANDO, 0)
		placeBuilding(map, 12, CITY, 1)
		const max = buildingData[CITY].stature
		map.layers.buildings[12]!.stature = max - 10 // mid-capture
		initGameStateFromMap(map)

		applyAction(map, { kind: 'move', from: 12, to: 13 })
		expect(map.layers.units[13]?.type).toBe(STRIKE_COMMANDO)
		expect(map.layers.buildings[12]?.stature).toBe(max)
	})
})
