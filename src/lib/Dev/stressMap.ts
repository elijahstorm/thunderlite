import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { deriveFromData } from '$lib/Map/Editor/mapExporter'
import { NEUTRAL_TEAM } from '$lib/Engine/gameState'

// Procedural map builder for the /dev/stress playground. It emits the same
// MapData shape the editor exports (and campaign levels ship as JSON), so the
// result is a genuine MapObject the engine, renderer and CPU accept unchanged —
// only scaled far past anything a hand-authored scene would reach.

const terrain = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`stress map: unknown terrain "${name}"`)
	return idx
}
const unitType = (name: string): number => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`stress map: unknown unit "${name}"`)
	return idx
}
const building = (name: string): number => {
	const idx = buildingData.findIndex((b) => b.name === name)
	if (idx < 0) throw new Error(`stress map: unknown building "${name}"`)
	return idx
}

// Small deterministic PRNG (mulberry32) so a given seed rebuilds the exact same
// board — makes an FPS regression reproducible instead of a moving target.
const makeRng = (seed: number) => {
	let a = seed >>> 0
	return () => {
		a |= 0
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export type StressConfig = {
	cols: number
	rows: number
	teams: number
	/** Ground/air units placed per team. */
	unitsPerTeam: number
	/** Neutral + owned buildings scattered across the map (excludes the per-team HQ). */
	buildings: number
	/** 0 = flat plains, 1 = maximally broken terrain (forest/hill/mountain/water clumps). */
	terrainVariety: number
	seed: number
	funds: number
}

export const DEFAULT_STRESS: StressConfig = {
	cols: 40,
	rows: 40,
	teams: 2,
	unitsPerTeam: 40,
	buildings: 20,
	terrainVariety: 0.5,
	seed: 1,
	funds: 999999,
}

export type StressPreset = { name: string; blurb: string; config: StressConfig }

export const STRESS_PRESETS: StressPreset[] = [
	{
		name: 'Baseline',
		blurb: 'A normal-sized match. Everything should be buttery — the control group.',
		config: { ...DEFAULT_STRESS, cols: 24, rows: 24, unitsPerTeam: 12, buildings: 10 },
	},
	{
		name: 'Large',
		blurb: '80×80 with a hundred units a side — where the per-frame terrain sweep starts to bite.',
		config: { ...DEFAULT_STRESS, cols: 80, rows: 80, unitsPerTeam: 100, buildings: 60 },
	},
	{
		name: 'Huge',
		blurb: '150×150, 250 units a side. Fog + threat recompute and the CPU turn get heavy here.',
		config: { ...DEFAULT_STRESS, cols: 150, rows: 150, unitsPerTeam: 250, buildings: 120 },
	},
	{
		name: 'Extreme',
		blurb: '250×250, 500 units a side, 4 teams. The "does it even build" test — expect jank.',
		config: {
			...DEFAULT_STRESS,
			cols: 250,
			rows: 250,
			teams: 4,
			unitsPerTeam: 500,
			buildings: 300,
			terrainVariety: 0.6,
		},
	},
	{
		name: 'Unit swarm',
		blurb: 'A modest map crammed with units — isolates unit count from map size.',
		config: { ...DEFAULT_STRESS, cols: 40, rows: 40, teams: 4, unitsPerTeam: 200, buildings: 40 },
	},
	{
		name: 'Vast & empty',
		blurb: 'A giant board with few units — isolates map size (tile sweep) from unit count.',
		config: { ...DEFAULT_STRESS, cols: 220, rows: 220, unitsPerTeam: 8, buildings: 20 },
	},
]

// Terrain a ground unit can sit on at spawn. Air units ignore this.
const GROUND_TERRAIN = ['Plains', 'Road', 'Forest', 'Hills', 'Wasteland', 'Canyon']
const GROUND_UNITS = [
	'Strike Commando',
	'Scorpion Tank',
	'Lance Tank',
	'Rocket Truck',
	'Mortar Truck',
	'Flak Tank',
	'Spider Tank',
]
const AIR_UNITS = ['Raptor Fighter', 'Vulture Drone', 'Condor Bomber']
const SCATTER_BUILDINGS = ['City', 'Warfactory', 'Ground Control', 'Oil Refinery']

export type StressStats = {
	tiles: number
	units: number
	buildings: number
	teams: number
	buildMs: number
}

export const buildStressMap = (config: StressConfig): { map: MapObject; stats: StressStats } => {
	const t0 = performance.now()
	const cols = Math.max(2, Math.floor(config.cols))
	const rows = Math.max(2, Math.floor(config.rows))
	const count = cols * rows
	const rng = makeRng(config.seed || 1)

	// --- terrain: start on plains, then stamp organic clumps via random walks so
	// the board reads like real terrain (forests, ridgelines, lakes) rather than
	// TV static. Higher variety => more, larger clumps.
	const PLAINS = terrain('Plains')
	const ground = new Array<{ type: number }>(count)
	for (let i = 0; i < count; i++) ground[i] = { type: PLAINS }

	const variety = Math.min(1, Math.max(0, config.terrainVariety))
	const clumpTerrains = ['Forest', 'Hills', 'Mountain', 'Sea', 'Wasteland'].map(terrain)
	const clumpCount = Math.floor((count / 60) * variety)
	for (let c = 0; c < clumpCount; c++) {
		const type = clumpTerrains[Math.floor(rng() * clumpTerrains.length)]
		let x = Math.floor(rng() * cols)
		let y = Math.floor(rng() * rows)
		const steps = 4 + Math.floor(rng() * 20 * variety)
		for (let s = 0; s < steps; s++) {
			if (x >= 0 && y >= 0 && x < cols && y < rows) ground[y * cols + x].type = type
			x += Math.floor(rng() * 3) - 1
			y += Math.floor(rng() * 3) - 1
		}
	}

	// Which tiles a ground unit / building may occupy.
	const groundTerrainSet = new Set(GROUND_TERRAIN.map(terrain))
	const isLand = (tile: number) => groundTerrainSet.has(ground[tile].type)

	// --- placement bookkeeping. One occupant per tile for both layers.
	const units: { type: number; team: number; l: number }[] = []
	const buildings: { type: number; team: number; l: number }[] = []
	const usedUnit = new Set<number>()
	const usedBuilding = new Set<number>()

	const landTiles: number[] = []
	for (let i = 0; i < count; i++) if (isLand(i)) landTiles.push(i)

	const takeLandTile = (used: Set<number>): number => {
		// Rejection-sample a free land tile; bail after a bounded number of tries
		// so a nearly-full board can't spin forever.
		for (let tries = 0; tries < 40; tries++) {
			const tile = landTiles[Math.floor(rng() * landTiles.length)]
			if (tile !== undefined && !used.has(tile)) return tile
		}
		return -1
	}

	const teams = Math.max(1, Math.min(NEUTRAL_TEAM, Math.floor(config.teams)))
	const cmd = building('Command Center')

	// Anchor each team with a Command Center so it owns build permissions / a HQ
	// the win-condition code recognises. Spread the anchors across the board.
	for (let team = 0; team < teams; team++) {
		const tile = takeLandTile(usedBuilding)
		if (tile < 0) continue
		usedBuilding.add(tile)
		buildings.push({ type: cmd, team, l: tile })
	}

	// Per-team armies.
	const airTypes = AIR_UNITS.map(unitType)
	const groundTypes = GROUND_UNITS.map(unitType)
	for (let team = 0; team < teams; team++) {
		for (let n = 0; n < config.unitsPerTeam; n++) {
			const air = rng() < 0.15
			const tile = takeLandTile(usedUnit)
			if (tile < 0) break
			usedUnit.add(tile)
			const pool = air ? airTypes : groundTypes
			units.push({ type: pool[Math.floor(rng() * pool.length)], team, l: tile })
		}
	}

	// Scattered buildings: mostly neutral, some owned, to exercise income/capture
	// and building-fade rendering at scale.
	const scatterTypes = SCATTER_BUILDINGS.map(building)
	for (let b = 0; b < config.buildings; b++) {
		const tile = takeLandTile(usedBuilding)
		if (tile < 0) break
		usedBuilding.add(tile)
		const owned = rng() < 0.35
		const team = owned ? Math.floor(rng() * teams) : NEUTRAL_TEAM
		buildings.push({ type: scatterTypes[Math.floor(rng() * scatterTypes.length)], team, l: tile })
	}

	const map = deriveFromData({
		title: `Stress ${cols}×${rows}`,
		cols,
		rows,
		fog: false,
		funds: config.funds,
		layers: { ground, sky: [], units, buildings },
	} as unknown as MapData)

	return {
		map,
		stats: {
			tiles: count,
			units: units.length,
			buildings: buildings.length,
			teams,
			buildMs: performance.now() - t0,
		},
	}
}
