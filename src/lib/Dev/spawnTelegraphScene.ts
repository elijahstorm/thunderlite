import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { deriveFromData } from '$lib/Map/Editor/mapExporter'

// Fixed board for the spawn-telegraph playground (/dev/spawn-telegraph). Unlike the
// shared dev scenes this one is authored around the scripted-spawn RESOLUTION rules
// so every case can be triggered deliberately and observed from either player's
// side — see the plan tables below, which the page drives through the real
// campaignInterface (spawn / setTerrain) and mirrors into `map.scheduledSpawns` for
// the ghost telegraph.

export const COLS = 13
export const ROWS = 9

const terrain = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`spawn-telegraph scene: unknown terrain "${name}"`)
	return idx
}
const unit = (name: string): number => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`spawn-telegraph scene: unknown unit "${name}"`)
	return idx
}
const building = (name: string): number => {
	const idx = buildingData.findIndex((b) => b.name === name)
	if (idx < 0) throw new Error(`spawn-telegraph scene: unknown building "${name}"`)
	return idx
}

export const tileAt = (x: number, y: number): number => y * COLS + x

const PLAINS = terrain('Plains')
const SEA = terrain('Sea')

// Tiles that start as open water — the "spawn onto terrain the unit can't survive
// on" case lands here (a ground unit onto sea → forfeited).
const SEA_TILES = [tileAt(8, 1), tileAt(8, 7)]

type UnitPlacement = { x: number; y: number; unit: string; team: number }

// Pre-placed pieces the scripted spawns / floods act ON. Kept alive-adjacent by a
// Command Center + anchor per team so an ambush or a drowning never ends the match
// mid-demo.
const UNITS: UnitPlacement[] = [
	{ x: 4, y: 1, unit: 'Scorpion Tank', team: 0 }, // team 0 blocks its own drop
	{ x: 6, y: 1, unit: 'Strike Commando', team: 1 }, // enemy ambushed by team 0's drop
	{ x: 2, y: 3, unit: 'Strike Commando', team: 0 }, // team 0 drowned by a flood
	{ x: 6, y: 7, unit: 'Strike Commando', team: 0 }, // enemy ambushed by team 1's drop
	{ x: 4, y: 7, unit: 'Scorpion Tank', team: 1 }, // team 1 blocks its own drop
	{ x: 10, y: 7, unit: 'Strike Commando', team: 1 }, // team 1 drowned by a flood
	{ x: 0, y: 3, unit: 'Scorpion Tank', team: 0 }, // anchor — keeps team 0 in the match
	{ x: 12, y: 5, unit: 'Scorpion Tank', team: 1 }, // anchor — keeps team 1 in the match
]

const BUILDINGS = [
	{ x: 0, y: 4, building: 'Command Center', team: 0 },
	{ x: 12, y: 4, building: 'Command Center', team: 1 },
]

/** A scripted spawn the page can preview (as a telegraph) and then resolve. */
export type SpawnCase = {
	team: number
	unit: string
	x: number
	y: number
	/** What this case demonstrates. */
	label: string
	/** The expected outcome once resolved. */
	expect: string
}

/** A scripted terrain change the page can resolve to drown its occupant. */
export type FloodCase = {
	x: number
	y: number
	label: string
	expect: string
}

export const SPAWN_PLAN: SpawnCase[] = [
	// Team 0 — a full sweep across the top row.
	{ team: 0, unit: 'Scorpion Tank', x: 2, y: 1, label: 'Empty tile', expect: 'Lands normally.' },
	{
		team: 0,
		unit: 'Scorpion Tank',
		x: 4,
		y: 1,
		label: 'Onto own unit',
		expect: 'Blocked — reinforcement forfeited (own unit stays).',
	},
	{
		team: 0,
		unit: 'Scorpion Tank',
		x: 6,
		y: 1,
		label: 'Onto enemy unit',
		expect: 'Ambush — enemy killed, reinforcement lands.',
	},
	{
		team: 0,
		unit: 'Scorpion Tank',
		x: 8,
		y: 1,
		label: 'Onto sea (invalid terrain)',
		expect: 'Forfeited — a ground unit can’t survive there.',
	},
	// Team 1 — the same sweep along the bottom row.
	{ team: 1, unit: 'Strike Commando', x: 2, y: 7, label: 'Empty tile', expect: 'Lands normally.' },
	{
		team: 1,
		unit: 'Strike Commando',
		x: 4,
		y: 7,
		label: 'Onto own unit',
		expect: 'Blocked — reinforcement forfeited (own unit stays).',
	},
	{
		team: 1,
		unit: 'Strike Commando',
		x: 6,
		y: 7,
		label: 'Onto enemy unit',
		expect: 'Ambush — enemy killed, reinforcement lands.',
	},
	{
		team: 1,
		unit: 'Strike Commando',
		x: 8,
		y: 7,
		label: 'Onto sea (invalid terrain)',
		expect: 'Forfeited — a ground unit can’t survive there.',
	},
]

export const FLOOD_PLAN: FloodCase[] = [
	{ x: 2, y: 3, label: 'Flood team 0 unit', expect: 'Terrain → Sea drowns the ground unit (no warning).' },
	{ x: 10, y: 7, label: 'Flood team 1 unit', expect: 'Terrain → Sea drowns the ground unit (no warning).' },
]

/** The telegraph markers for the whole plan, in the shape paint.ts / the AI read. */
export const planTelegraphs = (): SpawnTelegraph[] =>
	SPAWN_PLAN.map((s) => ({
		tile: tileAt(s.x, s.y),
		team: s.team,
		unitType: unit(s.unit),
		unitName: s.unit,
	}))

/** Fresh board — call on every (re)mount so each demo run starts from a clean slate. */
export const buildSpawnTelegraphMap = (): MapObject => {
	const ground: { type: number }[] = []
	for (let i = 0; i < COLS * ROWS; i++) {
		ground.push({ type: SEA_TILES.includes(i) ? SEA : PLAINS })
	}
	return deriveFromData({
		title: 'Spawn Telegraph',
		cols: COLS,
		rows: ROWS,
		fog: false,
		funds: 0,
		layers: {
			ground,
			sky: [],
			units: UNITS.map((p) => ({ type: unit(p.unit), team: p.team, l: tileAt(p.x, p.y) })),
			buildings: BUILDINGS.map((p) => ({
				type: building(p.building),
				team: p.team,
				l: tileAt(p.x, p.y),
			})),
		},
	} as unknown as MapData)
}
