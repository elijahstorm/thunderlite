// Throwaway-style validation for the 09-the-stronghold redesign: the script must
// parse through the real cutscene parser, every JSON placement must satisfy the
// engine's own placement rules, and the level's tactical premises (Warmachine
// assassination win, tank-tight fortress with one gate, foot-scalable walls)
// must hold against the real movement rules. Kept as a test so regressions surface.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseCutsceneScript } from '../src/lib/Campaign/cutsceneScript'
import { canPlaceUnit, drag } from '../src/lib/Engine/Interactor/Pathing/movement'
import { unitData } from '../src/lib/GameData/unit'
import { buildingData } from '../src/lib/GameData/building'
import { terrainData } from '../src/lib/GameData/terrain'
import { skyData } from '../src/lib/GameData/sky'
import type { CutsceneEvent } from '../src/lib/Campaign/cutsceneTypes'

const json = JSON.parse(
	readFileSync('src/lib/Campaign/levels/09-the-stronghold.json', 'utf-8')
) as {
	cols: number
	rows: number
	layers: {
		ground: { type: number }[]
		sky: { type: number; l: number }[]
		units: { type: number; team: number; l: number; health?: number }[]
		buildings: { type: number; team: number; l: number }[]
	}
}
const script = readFileSync('src/lib/Campaign/levels/09-the-stronghold.txt', 'utf-8')

const unitType = (name: string) => unitData.findIndex((u) => u.name === name)
const buildingType = (name: string) => buildingData.findIndex((b) => b.name === name)
const terrainType = (name: string) => terrainData.findIndex((t) => t.name === name)

const GATE = 5 * json.cols + 8 // the one road tile in the fortress wall
const WARMACHINE_TILE = json.layers.units.find((u) => u.type === unitType('Warmachine'))!.l

// 4-directional flood fill over tiles `probe` can stand on, using the engine's
// own drag rules — the same impassability gate real pathing uses.
const reachableFrom = (start: number, probe: UnitObject, blocked: ReadonlySet<number>) => {
	const seen = new Set<number>([start])
	const queue = [start]
	while (queue.length) {
		const tile = queue.pop()!
		const x = tile % json.cols
		for (const next of [tile - json.cols, tile + json.cols, tile - 1, tile + 1]) {
			if (next < 0 || next >= json.cols * json.rows) continue
			const nx = next % json.cols
			if (Math.abs(nx - x) > 1) continue
			if (seen.has(next) || blocked.has(next)) continue
			const terrain = json.layers.ground[next] as GroundObject
			if (terrainData[terrain.type].details === 'impassable') continue
			if (drag(probe, terrain) >= 100) continue
			seen.add(next)
			queue.push(next)
		}
	}
	return seen
}

const probeOf = (name: string): UnitObject =>
	({ type: unitType(name), team: 0, state: 0 }) as UnitObject
const PLAYER_START = 13 * json.cols + 7 // the player Command Center's doorstep

describe('09-the-stronghold map', () => {
	it('has a full ground layer and in-bounds sparse layers', () => {
		const size = json.cols * json.rows
		expect(json.layers.ground.length).toBe(size)
		for (const layer of [json.layers.sky, json.layers.units, json.layers.buildings]) {
			for (const e of layer) {
				expect(e.l).toBeGreaterThanOrEqual(0)
				expect(e.l).toBeLessThan(size)
			}
		}
		for (const t of json.layers.ground) expect(terrainData[t.type]).toBeDefined()
		for (const s of json.layers.sky) expect(skyData[s.type]).toBeDefined()
	})

	it('places every unit on terrain it could legally occupy', () => {
		for (const u of json.layers.units) {
			const terrain = json.layers.ground[u.l] as GroundObject
			const unit = { type: u.type, team: u.team, state: 0 } as UnitObject
			expect(canPlaceUnit(terrain, unit), `unit ${unitData[u.type].name} at l=${u.l}`).toBe(true)
		}
	})

	it('never stacks units, buildings on impassable ground, or units on buildings', () => {
		const unitTiles = json.layers.units.map((u) => u.l)
		expect(new Set(unitTiles).size).toBe(unitTiles.length)
		const buildingTiles = new Set(json.layers.buildings.map((b) => b.l))
		expect(buildingTiles.size).toBe(json.layers.buildings.length)
		for (const b of json.layers.buildings) {
			expect(buildingData[b.type]).toBeDefined()
			expect(terrainData[json.layers.ground[b.l].type].details).not.toBe('impassable')
		}
		for (const l of unitTiles) expect(buildingTiles.has(l)).toBe(false)
	})

	it('wins by Warmachine assassination: Kael has exactly one and no Command Center', () => {
		const warmachines = json.layers.units.filter(
			(u) => u.team === 1 && u.type === unitType('Warmachine')
		)
		expect(warmachines.length).toBe(1)
		// Death.Insta_Lose only fires for a team with no Command Center — the whole
		// point of the level. Kael owns NO buildings at all: no CC (which would
		// defuse the assassination win) and no cities (income he has no factory to
		// spend). The Warmachine is his production and his treasury.
		const kaelBuildings = json.layers.buildings.filter((b) => b.team === 1)
		expect(kaelBuildings.length).toBe(0)
		// The player still needs the standard base to defend and build from.
		for (const name of ['Command Center', 'Warfactory', 'Ground Control', 'Air Control']) {
			expect(
				json.layers.buildings.some((b) => b.team === 0 && b.type === buildingType(name)),
				`player ${name}`
			).toBe(true)
		}
	})

	it('fortress is tank-tight except the gate, while foot units can climb the walls', () => {
		// A tank rolling from the player base reaches the Warmachine only via the gate:
		// sealing that one road tile must cut off tank pathing entirely.
		const tank = probeOf('Scorpion Tank')
		const open = reachableFrom(PLAYER_START, tank, new Set())
		expect(open.has(WARMACHINE_TILE), 'gate admits armor').toBe(true)
		const sealed = reachableFrom(PLAYER_START, tank, new Set([GATE]))
		expect(sealed.has(WARMACHINE_TILE), 'no second armor route').toBe(false)
		// Boots do not care about the gate: commandos climb the crags.
		const foot = probeOf('Strike Commando')
		const climbed = reachableFrom(PLAYER_START, foot, new Set([GATE]))
		expect(climbed.has(WARMACHINE_TILE), 'walls are foot-scalable').toBe(true)
	})

	it('feeds the Warmachine: courtyard ore sits inside the wall, none outside', () => {
		const courtyard = reachableFrom(
			WARMACHINE_TILE,
			probeOf('Scorpion Tank'),
			new Set([GATE])
		)
		const mineable = [terrainType('Enriched Ore Deposit'), terrainType('Ore Deposit')]
		const oreTiles = json.layers.ground
			.map((g, l) => ({ g, l }))
			.filter(({ g }) => mineable.includes(g.type))
		expect(oreTiles.length).toBeGreaterThan(0)
		for (const { l } of oreTiles) expect(courtyard.has(l), `ore at l=${l} inside walls`).toBe(true)
	})

	it('guards the Warmachine with an adjacent Aegis', () => {
		const aegis = json.layers.units.find((u) => u.team === 1 && u.type === unitType('Aegis'))
		expect(aegis).toBeTruthy()
		const dx = Math.abs((aegis!.l % json.cols) - (WARMACHINE_TILE % json.cols))
		const dy = Math.abs(
			Math.floor(aegis!.l / json.cols) - Math.floor(WARMACHINE_TILE / json.cols)
		)
		expect(dx + dy).toBe(1)
	})

	it('starts mid-battle: both sides carry wounds from the first assault', () => {
		for (const team of [0, 1]) {
			expect(
				json.layers.units.some((u) => u.team === team && u.health != null),
				`team ${team} has a battered unit`
			).toBe(true)
		}
	})

	it('script parses, and every scripted spawn lands on legal terrain', () => {
		const parsed = parseCutsceneScript(script)
		expect(parsed).toBeTruthy()
		const events: CutsceneEvent[] = [
			...parsed.start,
			...parsed.win,
			...parsed.lose,
			...Object.values(parsed.turns).flatMap((teams) => Object.values(teams).flat()),
			...parsed.conditions.flatMap((c) => c.events),
		]
		const spawns = events.filter((e) => e.kind === 'spawn')
		expect(spawns.length).toBeGreaterThan(0)
		for (const s of spawns) {
			const tile = s.y * json.cols + s.x
			const terrain = json.layers.ground[tile] as GroundObject
			const unit = { type: unitType(s.unit), team: s.team, state: 0 } as UnitObject
			expect(
				canPlaceUnit(terrain, unit),
				`scripted ${s.unit} at ${s.x},${s.y} on ${terrainData[terrain.type].name}`
			).toBe(true)
			// Scripted spawns onto an occupied friendly tile are forfeited — never
			// author one on top of a map-placed unit of the same team.
			const occupant = json.layers.units.find((u) => u.l === tile)
			expect(occupant?.team, `spawn tile ${s.x},${s.y} blocked by own unit`).not.toBe(s.team)
		}
	})

	it('ash crowns the fortress: the keep airspace burns and the Petrel starts concealed', () => {
		const ashTiles = new Set(
			json.layers.sky.filter((s) => skyData[s.type].name === 'Ash Plume').map((s) => s.l)
		)
		expect(ashTiles.size).toBeGreaterThan(0)
		// The Warmachine's own airspace sits under the veil — no clean hover over
		// the kill target, a bomber parked there is hidden but burning.
		expect(ashTiles.has(WARMACHINE_TILE), 'keep is ash-covered').toBe(true)
		const petrel = json.layers.units.find(
			(u) => u.team === 1 && u.type === unitType('Petrel Stormrider')
		)
		expect(petrel).toBeTruthy()
		expect(ashTiles.has(petrel!.l), 'Petrel starts inside the ash').toBe(true)
		// The gate lane stays clear: the honest air approach exists, it is just
		// covered by flak and turrets instead of weather.
		for (const y of [5, 6, 7, 8]) expect(ashTiles.has(y * json.cols + 8)).toBe(false)
	})
})
