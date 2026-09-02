// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../../src/lib/Engine/Animator/animator', () => ({
	animateRoute: () => Promise.resolve(),
	animateHealthBar: () => Promise.resolve(),
	animateExplosion: () => Promise.resolve(),
	panBoardToBuiltUnit: () => false,
}))
vi.mock('../../src/lib/Audio/audioEngine', () => ({ audioEngine: { playSfx: () => {} } }))

import { applyAction } from '../../src/lib/Engine/applyAction'
import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { bestPlanFor, generatePlansFor } from '../../src/lib/Engine/cpuAi/candidates'
import { pickBuildOnce } from '../../src/lib/Engine/cpuAi/production'
import { unitValue } from '../../src/lib/Engine/cpuAi/evaluate'
import { expectedLossAt } from '../../src/lib/Engine/cpuAi/score'
import {
	beginCpuPlanning,
	endCpuPlanning,
	planningUnits,
} from '../../src/lib/Engine/cpuAi/planningContext'
import { TRANSPORTER_TYPE } from '../../src/lib/Engine/modifiers/transport'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'
import type { SerializedAction } from '../../src/lib/Engine/Interactor/serializedAction'

/**
 * The CPU and its transports (see .claude/ai-search-depth.md, section 8).
 *
 * Until this pass the planner never proposed `air-lift`, `ship-out`, `transport-load`
 * or `transport-unload`: a CPU-owned loaded Transporter only ever got `wait` plans and
 * hovered forever, and a commando on an island with Air Control never left it. These
 * pin the value model (a loaded carrier is worth its passenger), the `land` plan, and
 * the lift / ship combos.
 */

const T = (name: string) => unitData.findIndex((u) => u.name === name)
const B = (name: string) => buildingData.findIndex((b) => b.name === name)
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const SEA = terrainData.findIndex((t) => t.name === 'Sea')

const HEAVY = T('Heavy Commando')
const FLAK = T('Flak Tank')
const SCORPION = T('Scorpion Tank')

const COLS = 10
const ROWS = 8
const N = COLS * ROWS
const at = (x: number, y: number) => y * COLS + x

const makeMap = (): MapObject =>
	({
		cols: COLS,
		rows: ROWS,
		layers: {
			ground: new Array(N).fill(0).map(() => ({ type: PLAINS, state: 0 })),
			sky: new Array(N).fill(null),
			units: new Array(N).fill(null),
			buildings: new Array(N).fill(null),
		},
		highlights: new Array(N),
		route: [],
		pathHistory: [],
	}) as unknown as MapObject

const place = (map: MapObject, tile: number, type: number, team: number, health?: number) => {
	const unit = { type, state: 0, team, health: health ?? unitData[type].health } as UnitObject
	map.layers.units[tile] = unit
	return unit
}

const loadedTransporter = (map: MapObject, tile: number, team: number, passengerType = HEAVY) => {
	const passenger = {
		type: passengerType,
		state: 0,
		team,
		health: unitData[passengerType].health,
	} as UnitObject
	return place(map, tile, TRANSPORTER_TYPE, team, unitData[TRANSPORTER_TYPE].health)
		? Object.assign(map.layers.units[tile] as UnitObject, { rescuedUnit: passenger })
		: null
}

const building = (map: MapObject, tile: number, type: number, team: number) => {
	map.layers.buildings[tile] = {
		type,
		state: 0,
		team,
		stature: buildingData[type].stature,
	} as BuildingObject
}

const sea = (map: MapObject, tiles: number[]) => {
	for (const t of tiles) map.layers.ground[t] = { type: SEA, state: 0 }
}

/** Headless equivalent of `runCpuTurn`'s tick loop: no animation, no relay. */
const runCpuTurnSync = (map: MapObject, team: number): SerializedAction[] => {
	const log: SerializedAction[] = []
	for (let guard = 0; guard < 200; guard++) {
		let best: { score: number; actions: SerializedAction[] } | null = null
		beginCpuPlanning(map)
		try {
			const acted = get(gameState).actedTiles
			for (const { tile, unit } of planningUnits(map)) {
				if (unit.team !== team || acted.has(tile)) continue
				const plan = bestPlanFor(map, tile, unit, team)
				if (plan && (!best || plan.score > best.score)) best = plan
			}
		} finally {
			endCpuPlanning()
		}
		const actions = best?.actions ?? []
		if (actions.length === 0) {
			const build = pickBuildOnce(map, team)
			if (!build) return log
			applyAction(map, build)
			log.push(build)
			continue
		}
		for (const action of actions) {
			applyAction(map, action)
			log.push(action)
		}
	}
	return log
}

const planFor = (map: MapObject, tile: number, team: number) => {
	beginCpuPlanning(map)
	try {
		return bestPlanFor(map, tile, map.layers.units[tile] as UnitObject, team)
	} finally {
		endCpuPlanning()
	}
}

const plansFor = (map: MapObject, tile: number, team: number) => {
	beginCpuPlanning(map)
	try {
		return generatePlansFor(map, tile, map.layers.units[tile] as UnitObject, team)
	} finally {
		endCpuPlanning()
	}
}

const startTurn = (map: MapObject, team: number) => {
	initGameStateFromMap(map)
	gameState.update((s) => ({ ...s, currentTeam: team }))
}

describe('T1: value model', () => {
	it('prices a loaded carrier at least as high as its passenger', () => {
		const map = makeMap()
		const carrier = loadedTransporter(map, at(2, 2), 1)!
		const passenger = carrier.rescuedUnit as UnitObject
		expect(unitValue(carrier)).toBeGreaterThanOrEqual(unitValue(passenger))
		// ...and strictly above an empty hull, so the passenger is what's being protected.
		const empty = place(makeMap(), at(2, 2), TRANSPORTER_TYPE, 1)
		expect(unitValue(carrier)).toBeGreaterThan(unitValue(empty))
	})

	it('fears a lethal tile more when loaded than when empty', () => {
		const map = makeMap()
		startTurn(map, 1)
		// An enemy Flak Tank that can shoot down a 50 HP Transporter next turn.
		place(map, at(5, 4), FLAK, 0)
		const loaded = loadedTransporter(map, at(1, 1), 1)!
		const emptyMap = makeMap()
		startTurn(emptyMap, 1)
		place(emptyMap, at(5, 4), FLAK, 0)
		const empty = place(emptyMap, at(1, 1), TRANSPORTER_TYPE, 1)
		const target = at(5, 3) // adjacent to the flak: point-blank fire
		beginCpuPlanning(map)
		const lossLoaded = expectedLossAt(map, target, loaded, 1)
		endCpuPlanning()
		beginCpuPlanning(emptyMap)
		const lossEmpty = expectedLossAt(emptyMap, target, empty, 1)
		endCpuPlanning()
		expect(lossLoaded).toBeGreaterThan(lossEmpty)
	})
})

describe('T1: land', () => {
	beforeEach(() => gameState.set({ ...get(gameState), actedTiles: new Set() }))

	it('a loaded Transporter over land with a landable tile in reach unloads, never a bare wait', () => {
		const map = makeMap()
		startTurn(map, 1)
		loadedTransporter(map, at(2, 2), 1)
		// Something to fly toward, so "advance" has a direction.
		building(map, at(8, 6), B('Command Center'), 0)
		const plan = planFor(map, at(2, 2), 1)!
		expect(plan.kind).toBe('land')
		const last = plan.actions[plan.actions.length - 1]
		expect(last.kind).toBe('transport-unload')
		// Every wait plan the carrier could take is priced below every land plan.
		const plans = plansFor(map, at(2, 2), 1)
		const bestWait = Math.max(...plans.filter((p) => p.kind === 'wait').map((p) => p.score))
		const bestLand = Math.max(...plans.filter((p) => p.kind === 'land').map((p) => p.score))
		expect(bestLand).toBeGreaterThan(bestWait)
	})

	it('a carrier waking on a landable tile with a target in the passenger reach unloads in place, then the passenger acts', () => {
		const map = makeMap()
		startTurn(map, 1)
		loadedTransporter(map, at(3, 3), 1)
		// A wounded enemy tank the Heavy Commando can finish once it is on the ground
		// and free to move (unload without moving keeps the tile un-acted).
		place(map, at(5, 3), SCORPION, 0, 10)
		const log = runCpuTurnSync(map, 1)
		const unloadIdx = log.findIndex((a) => a.kind === 'transport-unload')
		expect(unloadIdx).toBeGreaterThanOrEqual(0)
		const unload = log[unloadIdx] as Extract<SerializedAction, { kind: 'transport-unload' }>
		expect(unload.transport).toBe(at(3, 3))
		expect(unload.tile).toBe(at(3, 3))
		// The passenger then attacked in the same turn.
		const attack = log.slice(unloadIdx + 1).find((a) => a.kind === 'attack')
		expect(attack).toBeDefined()
		expect(map.layers.units[at(5, 3)]).toBeNull()
	})

	it('a loaded carrier stays out of a flak zone an empty hull would risk', () => {
		const map = makeMap()
		startTurn(map, 1)
		// Sea everywhere except a single landing strip next to an enemy Flak Tank, so
		// the only landing is a lethal one and the carrier must weigh hover vs death.
		sea(
			map,
			Array.from({ length: N }, (_, i) => i).filter((i) => i !== at(6, 3) && i !== at(7, 3))
		)
		place(map, at(7, 3), FLAK, 0)
		loadedTransporter(map, at(1, 3), 1)
		const plan = planFor(map, at(1, 3), 1)!
		const dest = plan.actions.find((a) => a.kind === 'move')
		const endTile = dest && dest.kind === 'move' ? dest.to : at(1, 3)
		// It did not fly onto the strip beside the flak to die with its passenger.
		expect(endTile).not.toBe(at(6, 3))
		expect(plan.kind).not.toBe('land')
	})
})
