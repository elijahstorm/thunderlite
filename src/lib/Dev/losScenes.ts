import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { deriveFromData } from '$lib/Map/Editor/mapExporter'

// Authoring playground scenes for the line-of-sight / height experiments. Each
// scene is drawn as ASCII art (one char per tile) plus a handful of unit
// placements, then compiled to a runnable MapObject via deriveFromData — the same
// path campaign level JSON takes, so the board renders and plays for real.

const terrain = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`los scene: unknown terrain "${name}"`)
	return idx
}
const unitType = (name: string): number => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`los scene: unknown unit "${name}"`)
	return idx
}

// ground glyphs → terrain
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

const ROCKET = unitType('Rocket Truck') // indirect, range [3,5] — best for shadows
const MORTAR = unitType('Mortar Truck') // indirect, range [2,3]
const SCOUT = unitType('Strike Commando') // foot, sight 2
const TANK = unitType('Scorpion Tank') // direct armour

type Placement = { x: number; y: number; unit: number; team: number }

type SceneSpec = {
	id: string
	name: string
	blurb: string
	rows: string[]
	units: Placement[]
}

const SPECS: SceneSpec[] = [
	{
		id: 'canyon',
		name: 'Canyon Trench',
		blurb: 'Rocket Trucks either side of a sunken canyon channel. Watch the firing shadow fall into the canyon floor — indirect fire can’t reach a unit sheltering below.',
		rows: [
			'............',
			'....cccc....',
			'...cc..cc...',
			'..cc....cc..',
			'..c......c..',
			'..cc....cc..',
			'...cc..cc...',
			'....cccc....',
			'............',
		],
		units: [
			{ x: 1, y: 4, unit: ROCKET, team: 0 },
			{ x: 6, y: 4, unit: SCOUT, team: 1 },
			{ x: 10, y: 4, unit: ROCKET, team: 1 },
			{ x: 6, y: 1, unit: TANK, team: 0 },
		],
	},
	{
		id: 'ridge',
		name: 'Hill Ridge',
		blurb: 'A continuous hill ridge bisects the field. Compare viewer-relative (a unit on the ridge sees both sides) against raycast (the ridge shadows the far slope by distance).',
		rows: [
			'............',
			'............',
			'^^^^^^^^^^^^',
			'............',
			'............',
			'............',
			'^^^^^^^^^^^^',
			'............',
			'............',
		],
		units: [
			{ x: 2, y: 4, unit: SCOUT, team: 0 },
			{ x: 5, y: 2, unit: ROCKET, team: 0 },
			{ x: 9, y: 0, unit: TANK, team: 1 },
			{ x: 3, y: 8, unit: SCOUT, team: 1 },
		],
	},
	{
		id: 'mountains',
		name: 'Mountain Wall',
		blurb: 'A mountain massif. A spotter on the peak (tier 2) sees over everything; units in the valley are blind past the wall. High ground also adds the downhill damage bonus.',
		rows: [
			'....####....',
			'...######...',
			'..####.###..',
			'..###..####.',
			'r..#....##..r',
			'..###..###..',
			'..########..',
			'...######...',
			'....####....',
		],
		units: [
			{ x: 0, y: 4, unit: ROCKET, team: 0 },
			{ x: 5, y: 0, unit: SCOUT, team: 0 },
			{ x: 11, y: 4, unit: TANK, team: 1 },
			{ x: 6, y: 4, unit: SCOUT, team: 1 },
		],
	},
	{
		id: 'mixed',
		name: 'Mixed Terrain',
		blurb: 'Forest, hills, canyon and a peak together — a general sandbox for sight, range, shadows and the high-ground bonus all at once.',
		rows: [
			'..f..^^..#..',
			'..f..^^..#..',
			'rr...........',
			'...cc...ff...',
			'..cccc..ff...',
			'...cc........',
			'.....^^...##.',
			'..f..^^...##.',
			'..f..........',
		],
		units: [
			{ x: 0, y: 2, unit: ROCKET, team: 0 },
			{ x: 1, y: 8, unit: MORTAR, team: 0 },
			{ x: 6, y: 6, unit: SCOUT, team: 0 },
			{ x: 10, y: 2, unit: TANK, team: 1 },
			{ x: 8, y: 4, unit: SCOUT, team: 1 },
			{ x: 4, y: 0, unit: SCOUT, team: 1 },
		],
	},
]

export type LosScene = {
	id: string
	name: string
	blurb: string
	build: () => MapObject
}

const buildScene = (spec: SceneSpec): MapObject => {
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
	const units = spec.units.map((p) => ({ type: p.unit, team: p.team, l: p.y * cols + p.x }))
	return deriveFromData({
		title: spec.name,
		cols,
		rows: height,
		fog: true,
		funds: 0,
		layers: { ground, sky: [], units, buildings: [] },
	} as unknown as MapData)
}

export const losScenes: LosScene[] = SPECS.map((spec) => ({
	id: spec.id,
	name: spec.name,
	blurb: spec.blurb,
	build: () => buildScene(spec),
}))
