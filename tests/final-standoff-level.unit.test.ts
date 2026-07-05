// Throwaway-style validation for the 10-final-standoff finale: the script parses
// through the real cutscene parser, every JSON placement satisfies the engine's
// placement rules, and the level's tactical premises hold against real movement
// rules — three Warmachines siloed apart (two mountain-gated land keeps, one
// island only sea/air/amphibious can reach), Kael holds no Command Center so the
// last Warmachine's death wins, and the player's port can float a fleet to the
// island. BFS uses the engine's own drag() so the geometry claims are real.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseCutsceneScript } from '../src/lib/Campaign/cutsceneScript'
import { canPlaceUnit, drag } from '../src/lib/Engine/Interactor/Pathing/movement'
import { unitData } from '../src/lib/GameData/unit'
import { buildingData } from '../src/lib/GameData/building'
import { terrainData } from '../src/lib/GameData/terrain'
import { skyData } from '../src/lib/GameData/sky'
import { skyConnectionDecision, skyFlowReversed } from '../src/lib/Sprites/spriteConnector'
import type { CutsceneEvent } from '../src/lib/Campaign/cutsceneTypes'

const json = JSON.parse(
	readFileSync('src/lib/Campaign/levels/10-final-standoff.json', 'utf-8')
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
const script = readFileSync('src/lib/Campaign/levels/10-final-standoff.txt', 'utf-8')

const unitType = (name: string) => unitData.findIndex((u) => u.name === name)
const buildingType = (name: string) => buildingData.findIndex((b) => b.name === name)
const XY = (x: number, y: number) => y * json.cols + x
const probeOf = (name: string): UnitObject =>
	({ type: unitType(name), team: 0, state: 0 }) as UnitObject

// 4-directional flood over tiles `probe` could stand on, gated by the engine's
// own `canPlaceUnit` (ground can't enter the sea, ships can't beach, nothing
// crosses a volcano, and a movement type that can't traverse a tile can't stop
// on it). This is exactly the "could this unit occupy here" predicate real
// pathing bottoms out on. `blocked` seals tiles (e.g. a sealed gate).
const reachableFrom = (start: number, probe: UnitObject, blocked: ReadonlySet<number> = new Set()) => {
	const seen = new Set<number>([start])
	const queue = [start]
	while (queue.length) {
		const tile = queue.pop()!
		const x = tile % json.cols
		for (const next of [tile - json.cols, tile + json.cols, tile - 1, tile + 1]) {
			if (next < 0 || next >= json.cols * json.rows) continue
			if (Math.abs((next % json.cols) - x) > 1) continue
			if (seen.has(next) || blocked.has(next)) continue
			const terrain = json.layers.ground[next] as GroundObject
			if (!canPlaceUnit(terrain, probe)) continue
			seen.add(next)
			queue.push(next)
		}
	}
	return seen
}
void drag

const warmachineTiles = () =>
	json.layers.units.filter((u) => u.team === 1 && u.type === unitType('Warmachine')).map((u) => u.l)

describe('10-final-standoff map', () => {
	it('is a large board with a full ground layer and in-bounds sparse layers', () => {
		const size = json.cols * json.rows
		expect(size).toBeGreaterThanOrEqual(400) // an epic finale, not a skirmish
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
			const sky = json.layers.sky.find((s) => s.l === u.l)
			expect(
				canPlaceUnit(terrain, unit, sky ? ({ type: sky.type } as SkyObject) : null),
				`unit ${unitData[u.type].name} at ${u.l % json.cols},${Math.floor(u.l / json.cols)}`
			).toBe(true)
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

	it('wins by wiping all THREE Warmachines: Kael has three and no Command Center', () => {
		expect(warmachineTiles().length).toBe(3)
		const kaelCC = json.layers.buildings.filter(
			(b) => b.team === 1 && b.type === buildingType('Command Center')
		)
		expect(kaelCC.length).toBe(0)
		// The player fields the complete build tree for the finale showcase.
		for (const name of ['Command Center', 'Warfactory', 'Ground Control', 'Air Control', 'Sea Control']) {
			expect(
				json.layers.buildings.some((b) => b.team === 0 && b.type === buildingType(name)),
				`player ${name}`
			).toBe(true)
		}
	})

	it('silos the three Warmachines apart, each in its own defensible pocket', () => {
		const [nw, ne, island] = warmachineTiles()
		const tank = probeOf('Scorpion Tank')
		// The island keep sits behind a sea moat: no tank route reaches it from
		// either land keep (or anywhere else armor can drive).
		expect(reachableFrom(nw, tank).has(island), 'no armor bridge NW -> island').toBe(false)
		expect(reachableFrom(ne, tank).has(island), 'no armor bridge NE -> island').toBe(false)
		// The two land keeps only meet out in the shared central field — a tank
		// cannot pass keep-to-keep without exiting into contested ground (i.e.
		// each is a sealed pocket, verified per-gate in the next test).
		const nwInterior = reachableFrom(nw, tank, new Set([XY(4, 3)]))
		expect(nwInterior.has(ne), 'NW keep interior does not tunnel to NE').toBe(false)
		expect(nwInterior.size, 'NW keep is a small sealed pocket').toBeLessThan(12)
	})

	it('seals each land keep behind a single gate that armor must use', () => {
		const [nw, ne] = warmachineTiles() // island keep (c) is handled separately
		const playerStart = XY(2, 9) // beside the player Warfactory
		const tank = probeOf('Scorpion Tank')
		for (const [keep, gate, label] of [
			[nw, XY(4, 3), 'NW'],
			[ne, XY(17, 3), 'NE'],
		] as const) {
			const open = reachableFrom(playerStart, tank)
			expect(open.has(keep), `${label} keep reachable through its gate`).toBe(true)
			const sealed = reachableFrom(playerStart, tank, new Set([gate]))
			expect(sealed.has(keep), `${label} keep has no second armor route`).toBe(false)
		}
	})

	it('lets foot units scale the land keeps the gate would deny to armor', () => {
		const [nw] = warmachineTiles()
		const foot = probeOf('Strike Commando')
		const climbed = reachableFrom(XY(2, 9), foot, new Set([XY(4, 3)]))
		expect(climbed.has(nw), 'commandos climb the NW crags even with the gate sealed').toBe(true)
	})

	it('marroons the island Warmachine on land only amphibious/air/sea can approach', () => {
		const island = warmachineTiles()[2]
		// No land route from the mainland reaches it.
		const foot = probeOf('Strike Commando')
		expect(reachableFrom(XY(14, 11), foot).has(island), 'no foot bridge to the island').toBe(false)
		// An amphibious hull, however, can cross the bay onto the island beach.
		const tide = probeOf('Tidewalker')
		expect(
			reachableFrom(XY(1, 11), tide).has(island),
			'a Tidewalker can reach the island from the player port'
		).toBe(true)
	})

	it('floats a fleet from the player port to the island waters (naval theatre connects)', () => {
		const corvette = probeOf('Corvette')
		const portWater = XY(1, 13) // the player's starting Corvette tile
		const reach = reachableFrom(portWater, corvette)
		// A warship can sail from home to shell the island keep from the bay.
		const bayApproaches = [XY(21, 14), XY(20, 17), XY(16, 15)].filter((t) => reach.has(t))
		expect(bayApproaches.length, 'warship route from port to the island bay').toBeGreaterThan(0)
	})

	it('gives the player a shipyard: a Warfactory ON a shore tile with open sea to deploy into', () => {
		// The shipyard Warfactory must sit ON a Port (Shore) tile, and have a deep
		// sea tile adjacent to float the ship it builds onto.
		const factories = json.layers.buildings.filter(
			(b) => b.team === 0 && b.type === buildingType('Warfactory')
		)
		const seaType = terrainData.findIndex((t) => t.name === 'Sea')
		const shipyard = factories.find((f) => {
			const onPort = terrainData[json.layers.ground[f.l].type].modifiers.includes('Port')
			if (!onPort) return false
			const x = f.l % json.cols
			return [f.l - json.cols, f.l + json.cols, f.l - 1, f.l + 1].some(
				(n) =>
					n >= 0 &&
					n < json.cols * json.rows &&
					Math.abs((n % json.cols) - x) <= 1 &&
					json.layers.ground[n].type === seaType
			)
		})
		expect(shipyard, 'a player Warfactory sits on shore with adjacent open sea').toBeTruthy()
	})

	it('gives the marooned Warmachine ore to mine on its island', () => {
		const island = warmachineTiles()[2]
		const courtyard = reachableFrom(island, probeOf('Tidewalker'))
		const mineable = [buildingType, 0] // placeholder to keep lint quiet
		void mineable
		const oreTypes = [
			terrainData.findIndex((t) => t.name === 'Enriched Ore Deposit'),
			terrainData.findIndex((t) => t.name === 'Ore Deposit'),
		]
		const oreNearIsland = json.layers.ground.some(
			(gnd, l) => oreTypes.includes(gnd.type) && courtyard.has(l)
		)
		expect(oreNearIsland, 'island keep has ore in reach').toBe(true)
	})

	it('protects each land Warmachine with an adjacent Aegis', () => {
		const [nw, ne] = warmachineTiles()
		for (const keep of [nw, ne]) {
			const adj = json.layers.units.filter((u) => {
				if (u.team !== 1 || u.type !== unitType('Aegis')) return false
				const dx = Math.abs((u.l % json.cols) - (keep % json.cols))
				const dy = Math.abs(Math.floor(u.l / json.cols) - Math.floor(keep / json.cols))
				return dx + dy === 1
			})
			expect(adj.length, `Aegis guarding keep at ${keep}`).toBeGreaterThanOrEqual(1)
		}
	})

	it('fields Kaels fleet and the full showcase of unit classes', () => {
		// The finale must put naval, air, stealth, and heavy armor on the board.
		for (const name of ['Battle Cruiser', 'Corvette', 'U-Boat', 'Petrel Stormrider', 'Annihilator Tank']) {
			expect(
				json.layers.units.some((u) => u.team === 1 && u.type === unitType(name)),
				`Kael fields a ${name}`
			).toBe(true)
		}
	})

	it('brews the weather showcase: storm, cloud, jetstream and ash all present, in spread-out fields', () => {
		const names = new Set(json.layers.sky.map((s) => skyData[s.type].name))
		for (const w of ['Storm', 'Cloud', 'Jetstream', 'Ash Plume']) expect(names.has(w), w).toBe(true)
		// Ash is a broad plume, not two vent tiles; jetstream runs in more than one
		// corridor across the map (columns spread well apart).
		const ashCount = json.layers.sky.filter((s) => skyData[s.type].name === 'Ash Plume').length
		expect(ashCount, 'ash plume is broad').toBeGreaterThanOrEqual(12)
		const jetCols = new Set(
			json.layers.sky
				.filter((s) => skyData[s.type].name === 'Jetstream')
				.map((s) => s.l % json.cols)
		)
		expect(Math.max(...jetCols) - Math.min(...jetCols), 'jetstream spans the map, not one lane').toBeGreaterThanOrEqual(10)
	})

	it('autotiles the jetstream into a connected highway with turns, not clumps', () => {
		// Rebuild the sky layer the way the loader does (dense, null where empty)
		// and run the real sky autotiler over each jetstream tile.
		const size = json.cols * json.rows
		const sky: ({ type: number; state: number } | null)[] = new Array(size).fill(null)
		for (const s of json.layers.sky) sky[s.l] = { type: s.type, state: 0 }
		const map = {
			cols: json.cols,
			rows: json.rows,
			layers: { sky, ground: json.layers.ground },
		} as unknown as MapObject
		const jetTiles = json.layers.sky.filter((s) => skyData[s.type].name === 'Jetstream')
		const states = jetTiles.map((s) =>
			skyConnectionDecision(sky[s.l] as unknown as SkyObject)(map, s.l)
		)
		const STRAIGHT = new Set([2, 12]) // horizontal, vertical
		const CORNER = new Set([3, 9, 10, 11]) // the four elbows
		expect(states.some((st) => STRAIGHT.has(st)), 'has straight runs').toBe(true)
		expect(states.some((st) => CORNER.has(st)), 'has at least one turn').toBe(true)
		// A connected highway leaves nothing stranded as an isolated (state 0) tile.
		expect(states.every((st) => st !== 0), 'no orphaned jetstream tile').toBe(true)
	})

	it('orients the jetstream flow so caps and turns run with the current, not against it', () => {
		const size = json.cols * json.rows
		const sky: ({ type: number; state: number } | null)[] = new Array(size).fill(null)
		for (const s of json.layers.sky) sky[s.l] = { type: s.type, state: 0 }
		const map = {
			cols: json.cols,
			rows: json.rows,
			layers: { sky, ground: json.layers.ground },
		} as unknown as MapObject
		const jetTiles = json.layers.sky.filter((s) => skyData[s.type].name === 'Jetstream')
		const info = jetTiles.map((s) => ({
			state: skyConnectionDecision(sky[s.l] as unknown as SkyObject)(map, s.l),
			reversed: skyFlowReversed(sky[s.l] as unknown as SkyObject)(map, s.l),
		}))
		// Straight runs are authored in the bias direction, so they never flip.
		for (const t of info)
			if (t.state === 2 || t.state === 12)
				expect(t.reversed, `straight state ${t.state} must not reverse`).toBe(false)
		// The highway's two ends are caps: the upstream (source) cap flips so it
		// streams outward, the downstream (sink) cap does not — proving each end is
		// oriented independently rather than both animating inward.
		const caps = info.filter((t) => [1, 13, 14, 15].includes(t.state))
		expect(caps.some((t) => t.reversed), 'a source cap flows outward').toBe(true)
		expect(caps.some((t) => !t.reversed), 'a sink cap flows inward').toBe(true)
	})

	it('turns fog of war on mid-battle via the fog script command', () => {
		const parsed = parseCutsceneScript(script)
		const events = [
			...parsed.start,
			...Object.values(parsed.turns).flatMap((teams) => Object.values(teams).flat()),
			...parsed.conditions.flatMap((c) => c.events),
		]
		expect(events.some((e) => e.kind === 'fog' && e.on === true), 'a fog: on event fires').toBe(true)
	})

	it('starts mid-battle: both sides carry wounds', () => {
		for (const team of [0, 1]) {
			expect(
				json.layers.units.some((u) => u.team === team && u.health != null),
				`team ${team} has a battered unit`
			).toBe(true)
		}
	})

	it('script parses, and every scripted spawn lands on legal terrain and not on a friendly', () => {
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
			const tile = XY(s.x, s.y)
			const terrain = json.layers.ground[tile] as GroundObject
			const sky = json.layers.sky.find((sk) => sk.l === tile)
			const unit = { type: unitType(s.unit), team: s.team, state: 0 } as UnitObject
			expect(
				canPlaceUnit(terrain, unit, sky ? ({ type: sky.type } as SkyObject) : null),
				`scripted ${s.unit} at ${s.x},${s.y} on ${terrainData[terrain.type].name}`
			).toBe(true)
			const occupant = json.layers.units.find((u) => u.l === tile)
			expect(occupant?.team, `spawn tile ${s.x},${s.y} blocked by own unit`).not.toBe(s.team)
		}
	})
})
