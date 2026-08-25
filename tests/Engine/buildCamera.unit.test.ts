// @vitest-environment node
// The camera follows production the same way it follows a move: an opponent's
// factory or Warmachine roll-out is cut to, the local player's own builds are
// left alone unless they landed off-screen, and a build the viewer can't see is
// never revealed. See `panBoardToBuiltUnit`.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../src/lib/Audio/audioEngine', () => ({
	audioEngine: { playSfx: () => {} },
}))

import { applyAction } from '../../src/lib/Engine/applyAction'
import {
	setRouteCamera,
	clearRouteCamera,
	type RouteCamera,
} from '../../src/lib/Engine/Animator/animator'
import { gameState, resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

const idx = (table: { name: string }[], name: string): number => {
	const i = table.findIndex((t) => t.name === name)
	if (i < 0) throw new Error(`unknown: ${name}`)
	return i
}
const PLAINS = idx(terrainData, 'Plains')
const WARFACTORY = idx(buildingData, 'Warfactory')
const WARMACHINE = idx(unitData, 'Warmachine')
const SCORPION_TANK = idx(unitData, 'Scorpion Tank')

const TILE = 32
// A 2x2-tile window on a 4x4 board: tile 0 is in frame, tile 15 never is.
const VIEW = {
	left: 0,
	top: 0,
	width: 2 * TILE,
	height: 2 * TILE,
	tileWidth: TILE,
	tileHeight: TILE,
}

const makeMap = (): MapObject =>
	({
		cols: 4,
		rows: 4,
		layers: {
			ground: new Array(16).fill(0).map(() => ({ type: PLAINS, state: 0 })),
			sky: new Array(16).fill(null),
			units: new Array(16).fill(null),
			buildings: new Array(16).fill(null),
		},
		highlights: [],
		route: [],
		pathHistory: [],
	}) as unknown as MapObject

const fundTeam = (team: number) =>
	gameState.update((s) => ({
		...s,
		players: s.players.map((p) =>
			p.team === team ? { ...p, money: 9999, controls: { ground: 2, air: 2, sea: 2 } } : p
		),
	}))

type Fake = { camera: RouteCamera; panned: { left: number; top: number }[] }

const fakeCamera = (opts: { owns: boolean; sees: boolean }): Fake => {
	const panned: { left: number; top: number }[] = []
	const camera: RouteCamera = {
		view: () => ({ ...VIEW }),
		panTo: (left, top) => {
			panned.push({ left, top })
			return { left, top }
		},
		sees: () => opts.sees,
		owns: () => opts.owns,
	}
	return { camera, panned }
}

let active: RouteCamera | null = null
const register = (fake: Fake) => {
	active = fake.camera
	setRouteCamera(fake.camera)
}

describe('build camera follow', () => {
	beforeEach(() => resetGameState())
	afterEach(() => {
		if (active) clearRouteCamera(active)
		active = null
	})

	it('centres an opponent factory build on the built tile', () => {
		const map = makeMap()
		map.layers.buildings[15] = { type: WARFACTORY, state: 0, team: 1 }
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, currentTeam: 1 }))
		fundTeam(1)

		const fake = fakeCamera({ owns: false, sees: true })
		register(fake)
		applyAction(map, { kind: 'build', building: 15, unitType: SCORPION_TANK }, { live: true })

		expect(map.layers.units[15]?.type).toBe(SCORPION_TANK)
		// Tile (3,3) centred in a 64x64 window.
		expect(fake.panned).toEqual([{ left: 3.5 * TILE - TILE, top: 3.5 * TILE - TILE }])
	})

	it('never pans to a build the viewer cannot see', () => {
		const map = makeMap()
		map.layers.buildings[15] = { type: WARFACTORY, state: 0, team: 1 }
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, currentTeam: 1 }))
		fundTeam(1)

		const fake = fakeCamera({ owns: false, sees: false })
		register(fake)
		applyAction(map, { kind: 'build', building: 15, unitType: SCORPION_TANK }, { live: true })

		expect(map.layers.units[15]?.type).toBe(SCORPION_TANK)
		expect(fake.panned).toEqual([])
	})

	it('leaves the view alone for an own build already in frame', () => {
		const map = makeMap()
		map.layers.buildings[0] = { type: WARFACTORY, state: 0, team: 0 }
		initGameStateFromMap(map)
		fundTeam(0)

		const fake = fakeCamera({ owns: true, sees: true })
		register(fake)
		applyAction(map, { kind: 'build', building: 0, unitType: SCORPION_TANK }, { live: true })

		expect(map.layers.units[0]?.type).toBe(SCORPION_TANK)
		expect(fake.panned).toEqual([])
	})

	it('still pans for an own build that landed off-screen', () => {
		const map = makeMap()
		map.layers.buildings[15] = { type: WARFACTORY, state: 0, team: 0 }
		initGameStateFromMap(map)
		fundTeam(0)

		const fake = fakeCamera({ owns: true, sees: true })
		register(fake)
		applyAction(map, { kind: 'build', building: 15, unitType: SCORPION_TANK }, { live: true })

		expect(fake.panned).toEqual([{ left: 3.5 * TILE - TILE, top: 3.5 * TILE - TILE }])
	})

	it('follows a Warmachine build onto its adjacent spawn tile', () => {
		const map = makeMap()
		map.layers.units[15] = {
			type: WARMACHINE,
			state: 0,
			team: 1,
			health: unitData[WARMACHINE].health,
			wallet: 9999,
		}
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, currentTeam: 1 }))
		fundTeam(1)

		const fake = fakeCamera({ owns: false, sees: true })
		register(fake)
		applyAction(
			map,
			{ kind: 'build-adjacent', builder: 15, unitType: SCORPION_TANK, destination: 14 },
			{ live: true }
		)

		expect(map.layers.units[14]?.type).toBe(SCORPION_TANK)
		// Tile 14 is (2,3).
		expect(fake.panned).toEqual([{ left: 2.5 * TILE - TILE, top: 3.5 * TILE - TILE }])
	})

	it('does not pan for a replayed (non-live) build', () => {
		const map = makeMap()
		map.layers.buildings[15] = { type: WARFACTORY, state: 0, team: 1 }
		initGameStateFromMap(map)
		gameState.update((s) => ({ ...s, currentTeam: 1 }))
		fundTeam(1)

		const fake = fakeCamera({ owns: false, sees: true })
		register(fake)
		applyAction(map, { kind: 'build', building: 15, unitType: SCORPION_TANK })

		expect(map.layers.units[15]?.type).toBe(SCORPION_TANK)
		expect(fake.panned).toEqual([])
	})
})
