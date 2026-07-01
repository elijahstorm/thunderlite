// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { fogOfWarEnabled } from '../../src/lib/Engine/fogState'
import {
	updateFogBelief,
	recordFogKill,
	phantomThreatAt,
	strongestFogBelief,
	exploreValue,
} from '../../src/lib/Engine/cpuAi/fogMemory'
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
const FOREST = terrainIndex('Forest') // Conceals — only peekable from an adjacent tile
const SCOUT = unitIndex('Strike Commando') // sight 2
const TANK = unitIndex('Scorpion Tank')

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
	filters: { ground: () => [], sky: () => [], units: () => [], buildings: () => [] },
	route: new Array(cols * rows).fill(undefined),
	highlights: new Array(cols * rows).fill(undefined),
})

const beliefOf = (team: number) =>
	get(gameState).players.find((p) => p.team === team)?.fogBelief ?? {}

describe('fog belief — phantomThreatAt', () => {
	beforeEach(() => {
		const map = makeMap(20, 1)
		map.layers.units[0] = unit(SCOUT, 0)
		map.layers.units[19] = unit(SCOUT, 1)
		initGameStateFromMap(map)
		// Hand-plant a belief at tile 10.
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) => (p.team === 0 ? { ...p, fogBelief: { 10: 1 } } : p)),
		}))
	})

	it('is highest on the believed tile and falls off with distance', () => {
		const map = makeMap(20, 1)
		const onIt = phantomThreatAt(map, 0, 10)
		const near = phantomThreatAt(map, 0, 12)
		const far = phantomThreatAt(map, 0, 16)
		expect(onIt).toBeGreaterThan(near)
		expect(near).toBeGreaterThan(0)
		expect(far).toBe(0) // beyond FOG_REACH
	})

	it('is zero when the observer has no belief', () => {
		const map = makeMap(20, 1)
		expect(phantomThreatAt(map, 1, 10)).toBe(0)
	})
})

describe('fog belief — updateFogBelief seeding', () => {
	beforeEach(() => {
		fogOfWarEnabled.set(true)
	})

	it('seeds the fog a watched enemy slipped into when it leaves vision', () => {
		const map = makeMap(9, 1)
		map.layers.units[0] = unit(SCOUT, 0) // sight 2 → sees tiles 0,1,2
		map.layers.units[2] = unit(TANK, 1) // in sight
		initGameStateFromMap(map)

		updateFogBelief(map, 0) // snapshot: enemy seen at tile 2
		expect(Object.keys(beliefOf(0))).toHaveLength(0)

		// The enemy drives off into the fog.
		map.layers.units[2] = null
		map.layers.units[6] = unit(TANK, 1)
		updateFogBelief(map, 0)

		// Tile 3 is the fogged cell just past where we last saw it → now suspected.
		expect(beliefOf(0)[3]).toBeGreaterThan(0)
		expect(strongestFogBelief(0)).not.toBeNull()
	})

	it('recordFogKill seeds the killer tile when the victim could not see it', () => {
		const map = makeMap(9, 1)
		map.layers.units[0] = unit(SCOUT, 0) // team 0 sees 0,1,2
		map.layers.units[8] = unit(TANK, 1)
		initGameStateFromMap(map)

		// Our unit was destroyed by an enemy striking from tile 6 (dark to us).
		recordFogKill(map, 6, 0)
		expect(beliefOf(0)[6]).toBeGreaterThan(0)
	})

	it('recordFogKill plants nothing for a killer the victim can plainly see', () => {
		const map = makeMap(9, 1)
		map.layers.units[0] = unit(SCOUT, 0) // sees 0,1,2
		map.layers.units[8] = unit(TANK, 1)
		initGameStateFromMap(map)

		recordFogKill(map, 2, 0) // tile 2 is in plain sight → no guessing needed
		expect(beliefOf(0)[2]).toBeUndefined()
	})

	it('does NOT seed phantom contacts when the CPU merely moves its own units', () => {
		// Regression: a unit that moves also vacates a now-fogged tile. That must not be
		// mistaken for a loss, or the CPU hallucinates enemies on its own side. The
		// enemy here is kept well out of sight the whole time, so nothing legitimate
		// could seed — any belief tile would be a phantom.
		const map = makeMap(13, 1)
		map.layers.units[0] = unit(SCOUT, 0)
		map.layers.units[5] = unit(TANK, 0) // own forward unit (Scorpion sight 3 → sees 2..8)
		map.layers.units[12] = unit(TANK, 1) // never within anyone's sight
		initGameStateFromMap(map)

		updateFogBelief(map, 0) // snapshot own units at 0 and 5; no enemy ever seen
		// Advance the forward tank one tile — it's still on the board, just moved.
		map.layers.units[5] = null
		map.layers.units[4] = unit(TANK, 0)
		updateFogBelief(map, 0)

		expect(Object.keys(beliefOf(0))).toHaveLength(0)
	})

	it('rules out a believed tile once the CPU can see it is empty', () => {
		const map = makeMap(9, 1)
		map.layers.units[0] = unit(SCOUT, 0)
		initGameStateFromMap(map)
		// Plant a belief right next to our scout, on a tile it can see.
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) => (p.team === 0 ? { ...p, fogBelief: { 1: 1 } } : p)),
		}))

		updateFogBelief(map, 0) // tile 1 is within sight and empty → cleared
		expect(beliefOf(0)[1]).toBeUndefined()
	})

	it('marks tiles it sees and finds empty as ruled-out (cleared)', () => {
		const map = makeMap(9, 1)
		map.layers.units[0] = unit(SCOUT, 0) // sees tiles 0,1,2
		map.layers.units[8] = unit(SCOUT, 1)
		initGameStateFromMap(map)

		updateFogBelief(map, 0)
		const cleared = get(gameState).players.find((p) => p.team === 0)?.fogCleared ?? {}
		expect(cleared[1]).toBeGreaterThan(0) // seen and empty → ruled out
		expect(cleared[8]).toBeUndefined() // out of sight → never confirmed
	})

	it('clears all belief when fog is turned off', () => {
		const map = makeMap(9, 1)
		map.layers.units[0] = unit(SCOUT, 0)
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) => (p.team === 0 ? { ...p, fogBelief: { 5: 1 } } : p)),
		}))

		fogOfWarEnabled.set(false)
		updateFogBelief(map, 0)
		expect(Object.keys(beliefOf(0))).toHaveLength(0)
	})
})

describe('fog belief — exploration drive', () => {
	beforeEach(() => {
		fogOfWarEnabled.set(true)
	})

	it('rewards moving toward unseen fog over standing pat', () => {
		const map = makeMap(12, 1)
		map.layers.units[0] = unit(SCOUT, 0) // sight 2 → sees tiles 0,1,2
		map.layers.units[11] = unit(SCOUT, 1)
		initGameStateFromMap(map)

		const scout = map.layers.units[0]!
		const stay = exploreValue(map, 0, scout, 0) // already-seen neighbourhood
		const forward = exploreValue(map, 5, scout, 0) // diamond lands entirely in fog
		expect(forward).toBeGreaterThan(stay)
		expect(forward).toBeGreaterThan(0)
	})

	it('is zero with fog off (nothing to uncover)', () => {
		const map = makeMap(12, 1)
		map.layers.units[0] = unit(SCOUT, 0)
		initGameStateFromMap(map)
		fogOfWarEnabled.set(false)
		expect(exploreValue(map, 5, map.layers.units[0]!, 0)).toBe(0)
	})

	it('values getting beside a forest, and ignores forests it cannot peek into', () => {
		const mk = (forestTile?: number) => {
			const m = makeMap(12, 1)
			m.layers.units[0] = unit(SCOUT, 0) // sees 0,1,2
			m.layers.units[11] = unit(SCOUT, 1)
			if (forestTile != null) m.layers.ground[forestTile] = ground(FOREST)
			initGameStateFromMap(m)
			return m
		}
		// Standing on tile 3 puts the forest at tile 4 point-blank → counts (extra).
		const adjForest = exploreValue(mk(4), 3, unit(SCOUT, 0), 0)
		const adjPlains = exploreValue(mk(), 3, unit(SCOUT, 0), 0)
		expect(adjForest).toBeGreaterThan(adjPlains)

		// From tile 2 the forest at tile 4 is two away → can't see in, so it's worth
		// LESS than if that tile were open ground.
		const farForest = exploreValue(mk(4), 2, unit(SCOUT, 0), 0)
		const farPlains = exploreValue(mk(), 2, unit(SCOUT, 0), 0)
		expect(farForest).toBeLessThan(farPlains)
	})

	it('discounts re-checking ground it just confirmed empty', () => {
		const map = makeMap(12, 1)
		map.layers.units[0] = unit(SCOUT, 0)
		map.layers.units[11] = unit(SCOUT, 1)
		initGameStateFromMap(map)

		const before = exploreValue(map, 5, unit(SCOUT, 0), 0)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0 ? { ...p, fogCleared: { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 } } : p
			),
		}))
		const after = exploreValue(map, 5, unit(SCOUT, 0), 0)
		expect(after).toBeLessThan(before)
	})
})
