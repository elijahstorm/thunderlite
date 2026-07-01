// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { viewerVisibility } from '../../src/lib/Engine/fogState'
import {
	viewerTeam,
	shownThreatUnits,
	visibleEnemyUnits,
	toggleThreatUnit,
	toggleAllThreats,
	clearThreatOverlay,
	computeShownThreatTiles,
	computeShownThreatUnitTiles,
} from '../../src/lib/Engine/threatOverlay'

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

const STRIKE_COMMANDO = unitIndex('Strike Commando') // direct, range [1,1], power > 0
const STEALTH_TANK = unitIndex('Stealth Tank') // cloaks when no enemy adjacent
const PLAINS = terrainIndex('Plains')

const ground = (type: number): GroundObject => ({ type, state: 0 })
const unit = (type: number, team = 0): UnitObject => ({
	type,
	state: 0,
	team,
	health: unitData[type].health,
})

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

const xy = (cols: number, x: number, y: number) => y * cols + x

describe('threat overlay store', () => {
	beforeEach(() => {
		// Local player is team 0; fog off (everything visible) by default.
		viewerTeam.set(0)
		viewerVisibility.set(null)
		clearThreatOverlay()
	})

	it('visibleEnemyUnits lists off-team units and skips friendlies', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		const enemy = unit(STRIKE_COMMANDO, 1)
		map.layers.units[xy(cols, 5, 5)] = enemy
		map.layers.units[xy(cols, 2, 2)] = unit(STRIKE_COMMANDO, 0)

		expect(visibleEnemyUnits(map)).toEqual([enemy])
	})

	it('hides enemies the viewer cannot see when fog is on', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		const seenTile = xy(cols, 5, 5)
		const seen = unit(STRIKE_COMMANDO, 1)
		map.layers.units[seenTile] = seen
		map.layers.units[xy(cols, 9, 9)] = unit(STRIKE_COMMANDO, 1)
		viewerVisibility.set({ team: 0, visible: new Set([seenTile]) })

		expect(visibleEnemyUnits(map)).toEqual([seen])
	})

	it('toggleThreatUnit adds then removes a single unit', () => {
		const u = unit(STRIKE_COMMANDO, 1)
		toggleThreatUnit(u)
		expect(get(shownThreatUnits).has(u)).toBe(true)
		toggleThreatUnit(u)
		expect(get(shownThreatUnits).has(u)).toBe(false)
	})

	it('toggleAllThreats reveals every enemy, then clears when all already shown', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		const a = unit(STRIKE_COMMANDO, 1)
		const b = unit(STRIKE_COMMANDO, 1)
		map.layers.units[xy(cols, 3, 3)] = a
		map.layers.units[xy(cols, 7, 7)] = b

		toggleAllThreats(map)
		expect(get(shownThreatUnits)).toEqual(new Set([a, b]))

		// Everything already on → master toggle clears.
		toggleAllThreats(map)
		expect(get(shownThreatUnits).size).toBe(0)
	})

	it('toggleAllThreats fills the rest when only some are shown', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		const a = unit(STRIKE_COMMANDO, 1)
		const b = unit(STRIKE_COMMANDO, 1)
		map.layers.units[xy(cols, 3, 3)] = a
		map.layers.units[xy(cols, 7, 7)] = b

		toggleThreatUnit(a) // only one shown
		toggleAllThreats(map) // not all shown → reveal all
		expect(get(shownThreatUnits)).toEqual(new Set([a, b]))
	})

	it('computeShownThreatTiles unions the reach of shown enemies and self-heals dead units', () => {
		const cols = 15
		const map = makeMap(cols, 15)
		const enemy = unit(STRIKE_COMMANDO, 1)
		map.layers.units[xy(cols, 7, 7)] = enemy

		const tiles = computeShownThreatTiles(map, new Set([enemy]))
		expect(tiles.has(xy(cols, 8, 7))).toBe(true) // adjacent → reachable
		expect(tiles.has(xy(cols, 0, 0))).toBe(false) // far corner → safe

		// A shown unit that's left the board (died) contributes nothing.
		map.layers.units[xy(cols, 7, 7)] = null
		expect(computeShownThreatTiles(map, new Set([enemy])).size).toBe(0)
	})

	it('follows a toggled unit when it moves to a new tile', () => {
		const cols = 15
		const map = makeMap(cols, 15)
		const from = xy(cols, 7, 7)
		const to = xy(cols, 3, 3)
		const enemy = unit(STRIKE_COMMANDO, 1)
		map.layers.units[from] = enemy
		toggleThreatUnit(enemy)

		// Reach centers on the original tile.
		expect(computeShownThreatTiles(map, get(shownThreatUnits)).has(xy(cols, 8, 7))).toBe(true)
		expect(computeShownThreatUnitTiles(map, get(shownThreatUnits))).toEqual(new Set([from]))

		// Move the same unit object (mirrors applyMove keeping the reference).
		map.layers.units[from] = null
		map.layers.units[to] = enemy

		// The toggle follows the unit: reach recenters and the source marker tracks it.
		const tiles = computeShownThreatTiles(map, get(shownThreatUnits))
		expect(tiles.has(xy(cols, 4, 3))).toBe(true) // adjacent to new tile
		expect(tiles.has(xy(cols, 8, 7))).toBe(false) // old tile no longer threatened
		expect(computeShownThreatUnitTiles(map, get(shownThreatUnits))).toEqual(new Set([to]))
	})

	it('does not transfer the toggle to a different unit that takes the vacated tile', () => {
		const cols = 15
		const map = makeMap(cols, 15)
		const tile = xy(cols, 7, 7)
		const first = unit(STRIKE_COMMANDO, 1)
		map.layers.units[tile] = first
		toggleThreatUnit(first)

		// First unit vacates the tile; a different unit moves in.
		map.layers.units[tile] = null
		const second = unit(STRIKE_COMMANDO, 1)
		map.layers.units[xy(cols, 6, 7)] = first // first parked elsewhere
		map.layers.units[tile] = second

		const shown = get(shownThreatUnits)
		expect(shown.has(first)).toBe(true)
		expect(shown.has(second)).toBe(false)
		// The source markers cover the toggled first unit, never the second.
		expect(computeShownThreatUnitTiles(map, shown)).toEqual(new Set([xy(cols, 6, 7)]))
	})

	it('computeShownThreatTiles ignores enemies hidden in fog', () => {
		const cols = 15
		const map = makeMap(cols, 15)
		const enemy = unit(STRIKE_COMMANDO, 1)
		map.layers.units[xy(cols, 7, 7)] = enemy
		viewerVisibility.set({ team: 0, visible: new Set() }) // sees nothing

		expect(computeShownThreatTiles(map, new Set([enemy])).size).toBe(0)
		expect(computeShownThreatUnitTiles(map, new Set([enemy])).size).toBe(0)
	})

	it('never lists or draws the reach of a stealthed enemy (even with fog off)', () => {
		const cols = 15
		const map = makeMap(cols, 15)
		const stealth = unit(STEALTH_TANK, 1) // no enemy adjacent → concealed
		map.layers.units[xy(cols, 7, 7)] = stealth

		// Not offered to the planning overlay...
		expect(visibleEnemyUnits(map)).toEqual([])
		// ...and even if it's somehow in the shown set, its reach is not drawn.
		expect(computeShownThreatTiles(map, new Set([stealth])).size).toBe(0)
	})

	it('does draw a stealth unit once it is flushed into the open', () => {
		const cols = 15
		const map = makeMap(cols, 15)
		const stealth = unit(STEALTH_TANK, 1)
		map.layers.units[xy(cols, 7, 7)] = stealth
		map.layers.units[xy(cols, 8, 7)] = unit(STRIKE_COMMANDO, 0) // viewer unit point-blank → reveals it

		expect(visibleEnemyUnits(map)).toEqual([stealth])
		expect(computeShownThreatTiles(map, new Set([stealth])).size).toBeGreaterThan(0)
	})
})
