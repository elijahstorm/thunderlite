// Validation for the 04-trench-warfare reinforcement pass: the ocean was shrunk
// to two rows, an eastern supply road was added, and turns 2-6 feed randomised
// armor in off that road or the beach. Those rolls come off the match seed, so
// the wave assertions sweep a range of seeds rather than trusting one.
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseCutsceneScript } from '../src/lib/Campaign/cutsceneScript'
import { resolveRandomSpawn } from '../src/lib/Campaign/randomSpawn'
import { upcomingSpawns } from '../src/lib/Campaign/spawnTelegraph'
import { seedFromSession, setMatchSeed } from '../src/lib/Engine/matchSeed'
import type { CutsceneEvent } from '../src/lib/Campaign/cutsceneTypes'
import { canPlaceUnit } from '../src/lib/Engine/Interactor/Pathing/movement'
import { unitData } from '../src/lib/GameData/unit'
import { terrainData } from '../src/lib/GameData/terrain'

const json = JSON.parse(
	readFileSync('src/lib/Campaign/levels/04-trench-warfare.json', 'utf-8')
) as {
	cols: number
	rows: number
	layers: {
		ground: { type: number }[]
		units: { type: number; team: number; l: number; health?: number }[]
		buildings: { type: number; team: number; l: number }[]
	}
}
const scriptText = readFileSync('src/lib/Campaign/levels/04-trench-warfare.txt', 'utf-8')
const script = parseCutsceneScript(scriptText)

const ROAD = terrainData.findIndex((t) => t.name === 'Road')
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const SHORE = terrainData.findIndex((t) => t.name === 'Shore')
const SEA = terrainData.findIndex((t) => t.name === 'Sea')
const SCORPION = unitData.findIndex((u) => u.name === 'Scorpion Tank')
const LANCE = unitData.findIndex((u) => u.name === 'Lance Tank')

// Where armor comes up the supply road: down column 12, entering and leaving the
// map through column 13 at the two ends. The finale splits it north/south so its
// three rolls can never collide.
const NORTH_ROAD = new Set(['13,1', '12,1', '12,2'])
const SOUTH_ROAD = new Set(['12,4', '12,5', '13,5'])
const ROAD_TILES = new Set([...NORTH_ROAD, ...SOUTH_ROAD, '12,3'])

type RandomSpawn = Extract<CutsceneEvent, { kind: 'randomSpawn' }>
type Spawn = Extract<CutsceneEvent, { kind: 'spawn' }>

const at = (x: number, y: number) => json.layers.ground[y * json.cols + x].type

/** The `randomSpawn` beats `<turn round,1>` schedules, in script order. */
const wavesOn = (round: number, from = script): RandomSpawn[] =>
	(from.turns[round]?.[1] ?? []).filter((e): e is RandomSpawn => e.kind === 'randomSpawn')

/** What `<turn round,1>` actually drops, once per seed. */
const rolledSpawns = (round: number, seeds = 300): Spawn[][] => {
	const waves = wavesOn(round)
	const out: Spawn[][] = []
	for (let seed = 0; seed < seeds; seed++) {
		setMatchSeed(seed)
		out.push(waves.map((w) => resolveRandomSpawn(w)))
	}
	return out
}

// Restore the salt the rest of the suite assumes.
afterEach(() => setMatchSeed(0))

describe('04-trench-warfare board', () => {
	it('keeps the shore row but trims the ocean to two rows', () => {
		expect(json.rows).toBe(8)
		expect(json.layers.ground.length).toBe(json.cols * json.rows)
		// The beach is untouched: row 6 is still shore from x=6 east, water west.
		for (let x = 0; x < 6; x++) expect(terrainData[at(x, 6)].ocean).toBe(true)
		for (let x = 6; x < json.cols; x++) expect(at(x, 6)).toBe(SHORE)
		// Row 7 is the only remaining open water row.
		for (let x = 0; x < json.cols; x++) expect(terrainData[at(x, 7)].ocean).toBe(true)
	})

	it('breaks up the water with sea features rather than leaving it flat sea', () => {
		const water: number[] = []
		for (let x = 0; x < 6; x++) water.push(at(x, 6))
		for (let x = 0; x < json.cols; x++) water.push(at(x, 7))
		const features = water.filter((t) => t !== SEA)
		expect(features.length).toBeGreaterThan(0)
		for (const t of features) expect(terrainData[t].ocean).toBe(true)
	})

	it('runs a road down the eastern approach with a spur toward the front', () => {
		for (const y of [1, 2, 3, 4, 5]) expect(at(12, y)).toBe(ROAD)
		for (const x of [10, 11, 12]) expect(at(x, 3)).toBe(ROAD)
	})

	it('carries the supply road off the map at both ends instead of dead-ending it', () => {
		// The road runs in from off the eastern edge at the north end and back out at
		// the south, so the column reads as a highway passing through rather than a
		// stub laid on the border. Autotiling only continues a route through an edge
		// where its sole in-map connection is the opposite side (spriteConnector), so
		// these two tiles have to sit alone on their rows: the tiles above and below
		// them on column 13 must NOT be road, or the run turns into a coast road and
		// the frames change.
		expect(at(13, 1)).toBe(ROAD)
		expect(at(13, 5)).toBe(ROAD)
		for (const y of [0, 2, 3, 4, 6]) expect(at(13, y)).not.toBe(ROAD)
		// And the vacated column is open ground between the range and the beach.
		for (const y of [2, 3, 4]) expect(at(13, y)).toBe(PLAINS)
	})

	it('leaves every authored placement in bounds and on legal terrain', () => {
		const size = json.cols * json.rows
		for (const layer of [json.layers.units, json.layers.buildings]) {
			for (const e of layer) {
				expect(e.l).toBeGreaterThanOrEqual(0)
				expect(e.l).toBeLessThan(size)
			}
		}
		for (const u of json.layers.units) {
			const terrain = json.layers.ground[u.l] as GroundObject
			const unit = { type: u.type, team: u.team, state: 0 } as UnitObject
			expect(canPlaceUnit(terrain, unit), `unit ${unitData[u.type].name} at l=${u.l}`).toBe(true)
		}
	})
})

describe('04-trench-warfare reinforcement waves', () => {
	it('drops exactly one randomised tank on each of turns 2-4', () => {
		for (const round of [2, 3, 4]) {
			const runs = rolledSpawns(round)
			for (const spawns of runs) expect(spawns).toHaveLength(1)

			const names = new Set(runs.map((s) => s[0].unit))
			expect([...names].sort()).toEqual(['Lance Tank', 'Scorpion Tank'])

			// Both approaches, the eastern road and the beach, must be reachable.
			const tiles = new Set(runs.map((s) => `${s[0].x},${s[0].y}`))
			expect([...tiles].some((t) => ROAD_TILES.has(t))).toBe(true)
			expect([...tiles].some((t) => t.endsWith(',6'))).toBe(true)
		}
	})

	it('sends one of each type up both approaches on turn 5', () => {
		for (const spawns of rolledSpawns(5, 60)) {
			expect(spawns).toHaveLength(2)
			expect(spawns.map((s) => s.unit).sort()).toEqual(['Lance Tank', 'Scorpion Tank'])
			// Split pools, so the pair can never roll onto the same tile and forfeit.
			expect(spawns[0].y).toBeLessThan(6)
			expect(spawns[1].y).toBe(6)
		}
	})

	it('escalates the finale to three tanks on turn 6, one per pool', () => {
		const runs = rolledSpawns(6, 120)
		for (const spawns of runs) {
			expect(spawns).toHaveLength(3)
			// Three disjoint pools: north road, southern road, beach. No two rolls can
			// land on the same tile, so none of the three can forfeit to a collision.
			expect(NORTH_ROAD.has(`${spawns[0].x},${spawns[0].y}`)).toBe(true)
			expect(SOUTH_ROAD.has(`${spawns[1].x},${spawns[1].y}`)).toBe(true)
			expect(spawns[2].y).toBe(6)
			const tiles = new Set(spawns.map((s) => `${s.x},${s.y}`))
			expect(tiles.size).toBe(3)
		}
		// The middle slot is the one that varies by type; the flanks are fixed.
		expect(new Set(runs.map((s) => s[0].unit))).toEqual(new Set(['Lance Tank']))
		expect(new Set(runs.map((s) => s[2].unit))).toEqual(new Set(['Scorpion Tank']))
		expect([...new Set(runs.map((s) => s[1].unit))].sort()).toEqual(['Lance Tank', 'Scorpion Tank'])
	})

	it('ramps the wave size 1 -> 1 -> 2 -> 3 across the closing rounds', () => {
		expect([3, 4, 5, 6].map((round) => wavesOn(round).length)).toEqual([1, 1, 2, 3])
		// Turn 6 is the last word: nothing is scheduled behind it.
		expect(script.turns[7]).toBeUndefined()
	})

	it('only ever picks tiles a tank can actually be placed on', () => {
		for (const round of [2, 3, 4, 5, 6]) {
			for (const spawns of rolledSpawns(round, 60)) {
				for (const s of spawns) {
					expect(s.team).toBe(1)
					expect(s.x).toBeLessThan(json.cols)
					expect(s.y).toBeLessThan(json.rows)
					const terrain = json.layers.ground[s.y * json.cols + s.x] as GroundObject
					const type = s.unit === 'Scorpion Tank' ? SCORPION : LANCE
					expect(
						canPlaceUnit(terrain, { type, team: 1, state: 0 } as UnitObject),
						`${s.unit} at ${s.x},${s.y} (${terrainData[terrain.type].name})`
					).toBe(true)
				}
			}
		}
	})

	it('re-resolves to the same wave after a fresh parse, so a reload cannot drift', () => {
		setMatchSeed(seedFromSession('trench-reload'))
		for (const round of [2, 3, 4, 5, 6]) {
			const before = wavesOn(round).map((w) => resolveRandomSpawn(w))
			const reparsed = wavesOn(round, parseCutsceneScript(scriptText)).map((w) =>
				resolveRandomSpawn(w)
			)
			expect(reparsed).toEqual(before)
		}
	})

	it('telegraphs a rolled wave to its owner a turn ahead, like a hand-placed one', () => {
		const players = [{ team: 0 }, { team: 1 }]
		for (let seed = 0; seed < 25; seed++) {
			setMatchSeed(seed)
			// Player 0 is acting on round 2 (engine turn counter is 1-based), so team
			// 1's round-2 block is still to come this round.
			const telegraphs = upcomingSpawns(script, players, 0, 3, json.cols)
			expect(telegraphs).toHaveLength(1)
			const spawn = resolveRandomSpawn(wavesOn(2)[0])
			expect(telegraphs[0]).toEqual({
				tile: spawn.y * json.cols + spawn.x,
				team: 1,
				unitType: unitData.findIndex((u) => u.name === spawn.unit),
				unitName: spawn.unit,
			})
		}
	})
})
