import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { skyData } from '$lib/GameData/sky'
import { deriveFromData } from '$lib/Map/Editor/mapExporter'
import { NEUTRAL_TEAM } from '$lib/Engine/gameState'

// Shared tactical scenes for the dev playgrounds that need a real board (movement,
// AI, economy, rules). Same ASCII-art → deriveFromData path as the LOS scenes, so
// every scene is a genuine MapObject the engine functions accept directly.

const terrain = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`dev scene: unknown terrain "${name}"`)
	return idx
}
export const unitType = (name: string): number => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`dev scene: unknown unit "${name}"`)
	return idx
}
const building = (name: string): number => {
	const idx = buildingData.findIndex((b) => b.name === name)
	if (idx < 0) throw new Error(`dev scene: unknown building "${name}"`)
	return idx
}

const GLYPH: Record<string, number> = {
	'.': terrain('Plains'),
	r: terrain('Road'),
	f: terrain('Forest'),
	'^': terrain('Hills'),
	'#': terrain('Mountain'),
	c: terrain('Canyon'),
	w: terrain('Wasteland'),
	'~': terrain('Sea'),
}

type Placement = { x: number; y: number; type: number; team: number }

export type DevSceneSpec = {
	id: string
	name: string
	blurb: string
	rows: string[]
	units?: { x: number; y: number; unit: string; team: number }[]
	buildings?: { x: number; y: number; building: string; team: number }[]
	funds?: number
}

export type DevScene = {
	id: string
	name: string
	blurb: string
	build: () => MapObject
}

const buildScene = (spec: DevSceneSpec): MapObject => {
	const rows = spec.rows
	const cols = Math.max(...rows.map((r) => r.length))
	const height = rows.length
	const ground: { type: number }[] = []
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < cols; x++) {
			const glyph = rows[y][x] ?? '.'
			ground.push({ type: GLYPH[glyph] ?? GLYPH['.'] })
		}
	}
	const units: Placement[] = (spec.units ?? []).map((p) => ({
		x: p.x,
		y: p.y,
		type: unitType(p.unit),
		team: p.team,
	}))
	const buildings: Placement[] = (spec.buildings ?? []).map((p) => ({
		x: p.x,
		y: p.y,
		type: building(p.building),
		team: p.team,
	}))
	return deriveFromData({
		title: spec.name,
		cols,
		rows: height,
		fog: false,
		funds: spec.funds ?? 0,
		layers: {
			ground,
			sky: [],
			units: units.map((p) => ({ type: p.type, team: p.team, l: p.y * cols + p.x })),
			buildings: buildings.map((p) => ({ type: p.type, team: p.team, l: p.y * cols + p.x })),
		},
	} as unknown as MapData)
}

const SPECS: DevSceneSpec[] = [
	{
		id: 'crossroads',
		name: 'Crossroads',
		blurb: 'Roads, forest and hills around a central junction — see how movement type changes reach.',
		rows: [
			'..f....f..',
			'..f.rr.f..',
			'rrrrrrrrrr',
			'..^.rr.^..',
			'..^.rr.^..',
			'wwww..####',
		],
		units: [
			{ x: 0, y: 2, unit: 'Scorpion Tank', team: 0 },
			{ x: 9, y: 2, unit: 'Strike Commando', team: 1 },
		],
	},
	{
		id: 'skirmish',
		name: 'Skirmish',
		blurb: 'Two squads facing off across mixed terrain with capturable buildings — the AI inspector default.',
		rows: [
			'#..f...f..#',
			'#..^...^..#',
			'r..........',
			'....cccc...',
			'r..........',
			'#..f...f..#',
		],
		units: [
			{ x: 1, y: 2, unit: 'Scorpion Tank', team: 0 },
			{ x: 2, y: 4, unit: 'Strike Commando', team: 0 },
			{ x: 1, y: 0, unit: 'Rocket Truck', team: 0 },
			{ x: 9, y: 1, unit: 'Scorpion Tank', team: 1 },
			{ x: 8, y: 3, unit: 'Strike Commando', team: 1 },
			{ x: 9, y: 5, unit: 'Rocket Truck', team: 1 },
		],
		buildings: [
			{ x: 0, y: 2, building: 'Command Center', team: 0 },
			{ x: 10, y: 4, building: 'Command Center', team: 1 },
			{ x: 5, y: 0, building: 'Ground Control', team: NEUTRAL_TEAM },
		],
		funds: 1000,
	},
	{
		id: 'economy',
		name: 'Holdings',
		blurb: 'A spread of neutral and owned buildings — watch income, capture progress and supply tick.',
		rows: ['rrrrrrrr', 'r.r..r.r', 'r.r..r.r', 'rrrrrrrr'],
		units: [
			{ x: 1, y: 1, unit: 'Strike Commando', team: 0 },
			{ x: 6, y: 2, unit: 'Strike Commando', team: 1 },
		],
		buildings: [
			{ x: 0, y: 0, building: 'Command Center', team: 0 },
			{ x: 7, y: 3, building: 'Command Center', team: 1 },
			{ x: 3, y: 1, building: 'Ground Control', team: NEUTRAL_TEAM },
			{ x: 4, y: 2, building: 'Ground Control', team: NEUTRAL_TEAM },
		],
		funds: 0,
	},
	{
		id: 'ffa',
		name: 'Four-way FFA',
		blurb: 'Four armies (teams 0–3), each with a Command Center in a corner. Spectate and watch the runtime eliminate teams until one survives.',
		rows: [
			'r........r',
			'..f....f..',
			'...^..^...',
			'....cc....',
			'....cc....',
			'...^..^...',
			'..f....f..',
			'r........r',
		],
		units: [
			{ x: 1, y: 1, unit: 'Scorpion Tank', team: 0 },
			{ x: 2, y: 1, unit: 'Strike Commando', team: 0 },
			{ x: 8, y: 1, unit: 'Scorpion Tank', team: 1 },
			{ x: 7, y: 1, unit: 'Strike Commando', team: 1 },
			{ x: 1, y: 6, unit: 'Scorpion Tank', team: 2 },
			{ x: 2, y: 6, unit: 'Strike Commando', team: 2 },
			{ x: 8, y: 6, unit: 'Scorpion Tank', team: 3 },
			{ x: 7, y: 6, unit: 'Strike Commando', team: 3 },
		],
		buildings: [
			{ x: 0, y: 0, building: 'Command Center', team: 0 },
			{ x: 9, y: 0, building: 'Command Center', team: 1 },
			{ x: 0, y: 7, building: 'Command Center', team: 2 },
			{ x: 9, y: 7, building: 'Command Center', team: 3 },
		],
		funds: 500,
	},
	{
		id: 'duel2',
		name: 'Two-army duel',
		blurb: 'A clean 1-v-1 with Command Centers — the baseline for win-condition and death-state checks.',
		rows: ['r........r', '..f....f..', '....cc....', '..f....f..', 'r........r'],
		units: [
			{ x: 1, y: 2, unit: 'Scorpion Tank', team: 0 },
			{ x: 1, y: 1, unit: 'Strike Commando', team: 0 },
			{ x: 8, y: 2, unit: 'Scorpion Tank', team: 1 },
			{ x: 8, y: 3, unit: 'Strike Commando', team: 1 },
		],
		buildings: [
			{ x: 0, y: 0, building: 'Command Center', team: 0 },
			{ x: 9, y: 4, building: 'Command Center', team: 1 },
		],
		funds: 500,
	},
	{
		id: 'airfield',
		name: 'Open Skies',
		blurb: 'Air units over open ground — the scene to feel weather. Storm chips air HP every turn; cloud cover hides air units from sight.',
		rows: ['..........', '..........', '....cc....', '..........', '..........'],
		units: [
			{ x: 1, y: 0, unit: 'Raptor Fighter', team: 0 },
			{ x: 2, y: 2, unit: 'Condor Bomber', team: 0 },
			{ x: 1, y: 4, unit: 'Scorpion Tank', team: 0 },
			{ x: 8, y: 0, unit: 'Raptor Fighter', team: 1 },
			{ x: 7, y: 2, unit: 'Vulture Drone', team: 1 },
			{ x: 8, y: 4, unit: 'Scorpion Tank', team: 1 },
		],
		funds: 0,
	},
]

export const devScenes: DevScene[] = SPECS.map((spec) => ({
	id: spec.id,
	name: spec.name,
	blurb: spec.blurb,
	build: () => buildScene(spec),
}))

// Terrain palette for the lightweight dev grid renderer (no sprite loading).
export const TERRAIN_COLOR: Record<string, string> = {
	Plains: '#4d7c2f',
	Road: '#9ca3af',
	Forest: '#15803d',
	Hills: '#a16207',
	Mountain: '#78716c',
	Canyon: '#7c2d12',
	Wasteland: '#a8a29e',
	Sea: '#1d4ed8',
	Shore: '#0ea5e9',
}

export const terrainColor = (type: number): string =>
	TERRAIN_COLOR[terrainData[type]?.name] ?? '#334155'

// Sky/weather options for the weather playground. `null` = clear skies.
export const WEATHER_OPTIONS: { name: string; skyType: number | null }[] = [
	{ name: 'Clear', skyType: null },
	...skyData.map((s, i) => ({ name: s.name, skyType: i })),
]

/** Paint a uniform sky layer over an already-built map. Mutates in place and
 * returns the same map — call right after scene.build(), before mounting. */
export const applyWeather = (map: MapObject, skyType: number | null): MapObject => {
	const count = map.cols * map.rows
	map.layers.sky = Array.from({ length: count }, () =>
		skyType == null ? null : { type: skyType, state: 0 }
	)
	return map
}
