// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { viewerVisibility } from '../../src/lib/Engine/fogState'
import {
	viewerTeam,
	shownThreatUnits,
	visibleEnemyTiles,
	toggleThreatUnit,
	toggleAllThreats,
	clearThreatOverlay,
	computeShownThreatTiles,
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

	it('visibleEnemyTiles lists off-team units and skips friendlies', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		const enemy = xy(cols, 5, 5)
		const friend = xy(cols, 2, 2)
		map.layers.units[enemy] = unit(STRIKE_COMMANDO, 1)
		map.layers.units[friend] = unit(STRIKE_COMMANDO, 0)

		expect(visibleEnemyTiles(map)).toEqual([enemy])
	})

	it('hides enemies the viewer cannot see when fog is on', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		const seen = xy(cols, 5, 5)
		const hidden = xy(cols, 9, 9)
		map.layers.units[seen] = unit(STRIKE_COMMANDO, 1)
		map.layers.units[hidden] = unit(STRIKE_COMMANDO, 1)
		viewerVisibility.set({ team: 0, visible: new Set([seen]) })

		expect(visibleEnemyTiles(map)).toEqual([seen])
	})

	it('toggleThreatUnit adds then removes a single unit', () => {
		const tile = 42
		toggleThreatUnit(tile)
		expect(get(shownThreatUnits).has(tile)).toBe(true)
		toggleThreatUnit(tile)
		expect(get(shownThreatUnits).has(tile)).toBe(false)
	})

	it('toggleAllThreats reveals every enemy, then clears when all already shown', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		const a = xy(cols, 3, 3)
		const b = xy(cols, 7, 7)
		map.layers.units[a] = unit(STRIKE_COMMANDO, 1)
		map.layers.units[b] = unit(STRIKE_COMMANDO, 1)

		toggleAllThreats(map)
		expect(get(shownThreatUnits)).toEqual(new Set([a, b]))

		// Everything already on → master toggle clears.
		toggleAllThreats(map)
		expect(get(shownThreatUnits).size).toBe(0)
	})

	it('toggleAllThreats fills the rest when only some are shown', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		const a = xy(cols, 3, 3)
		const b = xy(cols, 7, 7)
		map.layers.units[a] = unit(STRIKE_COMMANDO, 1)
		map.layers.units[b] = unit(STRIKE_COMMANDO, 1)

		toggleThreatUnit(a) // only one shown
		toggleAllThreats(map) // not all shown → reveal all
		expect(get(shownThreatUnits)).toEqual(new Set([a, b]))
	})

	it('computeShownThreatTiles unions the reach of shown enemies and self-heals stale tiles', () => {
		const cols = 15
		const map = makeMap(cols, 15)
		const enemyTile = xy(cols, 7, 7)
		map.layers.units[enemyTile] = unit(STRIKE_COMMANDO, 1)

		const tiles = computeShownThreatTiles(map, new Set([enemyTile]))
		expect(tiles.has(xy(cols, 8, 7))).toBe(true) // adjacent → reachable
		expect(tiles.has(xy(cols, 0, 0))).toBe(false) // far corner → safe

		// A shown tile that no longer holds an enemy contributes nothing.
		const empty = computeShownThreatTiles(map, new Set([xy(cols, 1, 1)]))
		expect(empty.size).toBe(0)
	})

	it('computeShownThreatTiles ignores enemies hidden in fog', () => {
		const cols = 15
		const map = makeMap(cols, 15)
		const enemyTile = xy(cols, 7, 7)
		map.layers.units[enemyTile] = unit(STRIKE_COMMANDO, 1)
		viewerVisibility.set({ team: 0, visible: new Set() }) // sees nothing

		expect(computeShownThreatTiles(map, new Set([enemyTile])).size).toBe(0)
	})
})
