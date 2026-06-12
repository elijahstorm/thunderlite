// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { computeThreatTiles, unitThreatTiles } from '../../src/lib/Engine/Interactor/Pathing/threat'
import { generateActionsList, generatePreviewList } from '../../src/lib/Layers/tileHighlighter'

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
const TRANSPORTER = unitIndex('Transporter') // power 0 — cannot threaten
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

describe('threat computation', () => {
	it('flags tiles an enemy can reach and leaves distant tiles safe', () => {
		const cols = 15
		const map = makeMap(cols, 15)
		const enemyTile = xy(cols, 7, 7)
		map.layers.units[enemyTile] = unit(STRIKE_COMMANDO, 1)

		const threat = computeThreatTiles(map, 0)

		// Directly adjacent to the enemy is always within a melee unit's reach.
		expect(threat.has(xy(cols, 8, 7))).toBe(true)
		expect(threat.has(xy(cols, 7, 8))).toBe(true)
		// A far corner is well beyond move + attack range.
		expect(threat.has(xy(cols, 0, 0))).toBe(false)
	})

	it('a unit that deals no damage (power 0) threatens nothing', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		map.layers.units[xy(cols, 5, 5)] = unit(TRANSPORTER, 1)

		expect(computeThreatTiles(map, 0).size).toBe(0)
		expect(unitThreatTiles(map, xy(cols, 5, 5), unit(TRANSPORTER, 1)).size).toBe(0)
	})

	it('ignores friendly units when building the danger zone', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		// Same team as the querying side → not a threat to team 0.
		map.layers.units[xy(cols, 5, 5)] = unit(STRIKE_COMMANDO, 0)

		expect(computeThreatTiles(map, 0).size).toBe(0)
	})
})

describe('generateActionsList — threat warnings on movement tiles', () => {
	it('marks only the move tiles inside the threat set, never attack tiles', () => {
		const cols = 15
		const map = makeMap(cols, 15)
		const selfTile = xy(cols, 7, 7)
		const mover = unit(STRIKE_COMMANDO, 0)
		map.layers.units[selfTile] = mover

		// A single reachable tile is "threatened"; the unit's own tile is not.
		const threatened = xy(cols, 8, 7)
		const actions = generateActionsList(map, selfTile, mover, new Set([threatened]))

		const moveHighlights = actions.filter((h) => h.type === 0)
		const exposed = moveHighlights.find((h) => h.tile === threatened)
		const safe = moveHighlights.find((h) => h.tile === selfTile)

		expect(exposed?.threatened).toBe(true)
		expect(exposed?.tip).toBe(2) // "bad" → warning icon
		expect(safe?.threatened).toBe(false)
		expect(safe?.tip).toBe(1) // "neutral" → no warning

		// Attack highlights must never carry the move-tile warning.
		expect(actions.filter((h) => h.type === 1).every((h) => !h.threatened)).toBe(true)
	})

	it('marks nothing as threatened when no threat set is supplied', () => {
		const cols = 11
		const map = makeMap(cols, 11)
		const selfTile = xy(cols, 5, 5)
		const mover = unit(STRIKE_COMMANDO, 0)
		map.layers.units[selfTile] = mover

		const actions = generateActionsList(map, selfTile, mover)
		expect(actions.every((h) => !h.threatened)).toBe(true)
	})
})

describe('generatePreviewList — enemy move + attack preview', () => {
	it('returns move tiles (incl. the unit itself) and a non-overlapping attack range', () => {
		const cols = 15
		const map = makeMap(cols, 15)
		const enemyTile = xy(cols, 7, 7)
		const enemy = unit(STRIKE_COMMANDO, 1)
		map.layers.units[enemyTile] = enemy

		const preview = generatePreviewList(map, enemyTile, enemy)
		const moveTiles = new Set(preview.filter((h) => h.type === 0).map((h) => h.tile))
		const attackTiles = preview.filter((h) => h.type === 1).map((h) => h.tile)

		// The unit's own square is part of its movement set.
		expect(moveTiles.has(enemyTile)).toBe(true)
		// There is an attack range to show, and it never overlaps the move range.
		expect(attackTiles.length).toBeGreaterThan(0)
		expect(attackTiles.every((t) => !moveTiles.has(t))).toBe(true)
		// A preview is read-only: it never raises the player's threat warning.
		expect(preview.every((h) => !h.threatened)).toBe(true)
	})
})
