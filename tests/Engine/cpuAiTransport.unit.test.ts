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
import { endTurn } from '../../src/lib/Engine/turnLoop'
import { runCpuTurn } from '../../src/lib/Engine/cpuAi'
import { devScenes } from '../../src/lib/Dev/devScenes'
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
const STEALTH = T('Stealth Tank')
const STRIKE = T('Strike Commando')

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

// An island board: land on the left (x 0..2), a strait (x 3..6), land on the right
// (x 7..9). Nothing can walk across. Team 1 is the CPU and starts on the left.
const islandBoard = (airControl: boolean) => {
	const map = makeMap()
	startTurn(map, 1)
	for (let y = 0; y < ROWS; y++) for (let x = 3; x <= 6; x++) sea(map, [at(x, y)])
	if (airControl) building(map, at(0, 1), B('Air Control'), 1)
	building(map, at(8, 3), B('Command Center'), 0)
	place(map, at(1, 3), HEAVY, 1)
	// Controls are derived from buildings at init; re-derive now that they exist.
	initGameStateFromMap(map)
	gameState.update((s) => ({ ...s, currentTeam: 1 }))
	return map
}

describe('T2: air lift', () => {
	it('an island commando with Air Control lifts, flies and lands toward the enemy HQ', () => {
		const map = islandBoard(true)
		const plan = planFor(map, at(1, 3), 1)!
		expect(plan.kind).toBe('air-lift')
		expect(plan.actions.map((a) => a.kind)).toEqual(['air-lift', 'move', 'transport-unload'])
		const move = plan.actions[1] as Extract<SerializedAction, { kind: 'move' }>
		// Landed on the far island, not back on its own.
		expect(move.to % COLS).toBeGreaterThanOrEqual(7)
		const unload = plan.actions[2] as Extract<SerializedAction, { kind: 'transport-unload' }>
		expect(unload.transport).toBe(move.to)
		expect(unload.tile).toBe(move.to)
	})

	it('the same board without Air Control generates no lift plan at all', () => {
		const map = islandBoard(false)
		const plans = plansFor(map, at(1, 3), 1)
		expect(plans.some((p) => p.kind === 'air-lift')).toBe(false)
	})

	it('never lifts to a tile it could walk to (walking is preferred, no duplicates)', () => {
		const map = makeMap()
		startTurn(map, 1)
		building(map, at(0, 1), B('Air Control'), 1)
		building(map, at(3, 3), B('Command Center'), 0)
		place(map, at(1, 3), HEAVY, 1)
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, currentTeam: 1 }))
		const plans = plansFor(map, at(1, 3), 1)
		// The objective is two tiles away on open plains: the feet get there, so no lift
		// plan targets any tile the feet reach, and the chosen plan is the plain walk-on.
		const footTiles = new Set(
			plans
				.filter((p) => p.kind !== 'air-lift')
				.flatMap((p) =>
					p.actions.filter((a) => a.kind === 'move').map((a) => (a as { to: number }).to)
				)
		)
		for (const lift of plans.filter((p) => p.kind === 'air-lift')) {
			const move = lift.actions.find((a) => a.kind === 'move') as { to: number } | undefined
			if (move) expect(footTiles.has(move.to)).toBe(false)
		}
		const plan = planFor(map, at(1, 3), 1)!
		expect(plan.kind).toBe('capture')
	})

	it('a flight cut short by a concealed enemy drops the unload and keeps the passenger aboard', async () => {
		// A single-row strip so the only route runs through the hidden tank.
		const cols = 12
		const strip = {
			cols,
			rows: 1,
			layers: {
				ground: new Array(cols).fill(0).map(() => ({ type: PLAINS, state: 0 })),
				sky: new Array(cols).fill(null),
				units: new Array(cols).fill(null),
				buildings: new Array(cols).fill(null),
			},
			highlights: new Array(cols),
			route: [],
			pathHistory: [],
		} as unknown as MapObject
		for (let x = 3; x <= 6; x++) strip.layers.ground[x] = { type: SEA, state: 0 }
		strip.layers.buildings[0] = {
			type: B('Air Control'),
			state: 0,
			team: 1,
			stature: buildingData[B('Air Control')].stature,
		} as BuildingObject
		strip.layers.buildings[7] = {
			type: B('Command Center'),
			state: 0,
			team: 0,
			stature: buildingData[B('Command Center')].stature,
		} as BuildingObject
		place(strip, 1, HEAVY, 1)
		// A cloaked enemy in the strait the CPU can't perceive: pathing ghosts through it.
		const lurker = place(strip, 5, STEALTH, 0)
		lurker.hidden = true
		initGameStateFromMap(strip)
		gameState.update((s) => ({ ...s, currentTeam: 1 }))

		const before = planFor(strip, 1, 1)!
		expect(before.kind).toBe('air-lift')
		expect((before.actions[1] as { to: number }).to).toBe(7)

		vi.useFakeTimers()
		let ended = false
		const handle = runCpuTurn({
			humanTeam: 0,
			endTurn: () => {
				ended = true
			},
			map: strip,
			delayMs: 1,
		})
		await vi.runAllTimersAsync()
		handle.cancel()
		vi.useRealTimers()
		expect(ended).toBe(true)
		// Collided at x=5, so it stopped on x=4 still holding the commando; the HQ tile
		// is untouched and no unload happened.
		const carrier = strip.layers.units[4]
		expect(carrier?.type).toBe(TRANSPORTER_TYPE)
		expect(carrier?.rescuedUnit?.type).toBe(HEAVY)
		expect(strip.layers.units[7]).toBeNull()
		// Next turn the T1 land plan picks the stranded carrier up.
		gameState.update((s) => ({ ...s, actedTiles: new Set(), currentTeam: 1 }))
		const next = planFor(strip, 4, 1)!
		expect(['land', 'wait']).toContain(next.kind)
	})
})

describe('T3: ship out and load', () => {
	it('a unit on a Port with Sea Control embarks and sails when the shore route beats the feet', () => {
		const map = makeMap()
		// Left island x 0..2, shore column at x=3 (Port), sea x 4..6, shore at x=7,
		// land x 8..9 with the enemy HQ.
		const SHORE = terrainData.findIndex((t) => t.name === 'Shore')
		for (let y = 0; y < ROWS; y++) {
			map.layers.ground[at(3, y)] = { type: SHORE, state: 0 }
			map.layers.ground[at(7, y)] = { type: SHORE, state: 0 }
			for (let x = 4; x <= 6; x++) sea(map, [at(x, y)])
		}
		building(map, at(0, 1), B('Sea Control'), 1)
		building(map, at(9, 3), B('Command Center'), 0)
		place(map, at(3, 3), SCORPION, 1)
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, currentTeam: 1 }))
		const plans = plansFor(map, at(3, 3), 1)
		const ships = plans.filter((p) => p.kind === 'ship-out')
		expect(ships.length).toBeGreaterThan(0)
		// A Leviathan moves 4: from x=3 it reaches the far shore at x=7 and lands there.
		const landing = ships.find((p) => p.actions.some((a) => a.kind === 'transport-unload'))
		expect(landing).toBeDefined()
		const plan = planFor(map, at(3, 3), 1)!
		expect(plan.kind).toBe('ship-out')
		expect(plan.actions[0]).toEqual({ kind: 'ship-out', tile: at(3, 3) })
	})

	it('a commando boards an idle empty Transporter when it opens a route the feet lack', () => {
		const map = islandBoard(false)
		// No Air Control this time, but a map-authored empty Transporter idles next door.
		place(map, at(2, 3), TRANSPORTER_TYPE, 1)
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, currentTeam: 1 }))
		const plans = plansFor(map, at(1, 3), 1)
		const load = plans.find((p) => p.kind === 'load')
		expect(load).toBeDefined()
		const last = load!.actions[load!.actions.length - 1]
		expect(last.kind).toBe('transport-load')
		expect((last as { transport: number }).transport).toBe(at(2, 3))
	})
})

describe('T2/T3: the islands scene', () => {
	it('CPU vs CPU crosses the strait by air instead of stalemating', () => {
		const scene = devScenes.find((s) => s.id === 'islands')!
		const map = scene.build()
		initGameStateFromMap(map)
		const log: SerializedAction[] = []
		for (let i = 0; i < 16; i++) {
			const state = get(gameState)
			if (state.phase !== 'playing') break
			log.push(...runCpuTurnSync(map, state.currentTeam))
			endTurn({ map })
		}
		// Somebody lifted, and somebody set foot on the other island (the far shore is
		// x=8 for team 0 and x=4 for team 1). Before this pass the log was nothing but
		// waits and the two sides stared across the strait forever.
		expect(log.some((a) => a.kind === 'air-lift')).toBe(true)
		const crossed = map.layers.units.some((u, t) => {
			if (!u) return false
			const x = t % map.cols
			return (u.team === 0 && x >= 8) || (u.team === 1 && x <= 4)
		})
		const captured = map.layers.buildings.some(
			(b, t) => b && ((b.team === 0 && t % map.cols >= 8) || (b.team === 1 && t % map.cols <= 4))
		)
		expect(crossed || captured).toBe(true)
	})
})
