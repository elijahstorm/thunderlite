import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { deriveFromData } from '$lib/Map/Editor/mapExporter'

// Playground scenes for the CPU's FOG belief (cpuAi/fogMemory.ts) — its hunch about
// where contacts it lost into the fog probably are. Fog is ON in every scene (the
// belief is meaningless without it). Each pairs a CPU (team 1) with eyes on the field
// against a player (team 0) force you can dart in and out of its vision: park a unit
// where the CPU can see it, then pull it back into the dark, and watch the CPU seed a
// belief at its last-known spot — or kill a forward CPU unit and watch it grow wary of
// where the loss happened.
//
// Same ASCII + placement format as the other dev scenes. Occlusion is off by default,
// so "fog" here is pure sight-radius: anything outside a CPU unit's sight diamond is
// dark to it.

const terrain = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`fog scene: unknown terrain "${name}"`)
	return idx
}
const unitType = (name: string): number => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`fog scene: unknown unit "${name}"`)
	return idx
}

const GLYPH: Record<string, number> = {
	'.': terrain('Plains'),
	r: terrain('Road'),
	f: terrain('Forest'),
	'^': terrain('Mountain'),
	h: terrain('Hills'),
	c: terrain('Canyon'),
	w: terrain('Wasteland'),
	'~': terrain('Sea'),
	s: terrain('Shore'),
}

const SCOUT = unitType('Strike Commando') // sight 2, mobile — your probe
const TANK = unitType('Scorpion Tank') // direct bruiser
const HEAVY = unitType('Annihilator Tank') // costly — the unit the CPU least wants to risk blind
const RECON = unitType('Jammer Truck') // sight + mobility; here just a roving CPU sensor

type UnitPlace = { x: number; y: number; unit: number; team: number }

type SceneSpec = {
	id: string
	name: string
	blurb: string
	tip: string
	rows: string[]
	units: UnitPlace[]
}

const SPECS: SceneSpec[] = [
	{
		id: 'picket',
		name: 'Open Picket',
		blurb: 'A CPU picket watching open ground — easy to read how a contact is lost and pinned.',
		tip: 'Click "Scan as CPU" once to take its opening snapshot, then move one of your units out of its sentries’ sight and scan again: a belief blooms on the fog you slipped into. Hit Q to see it on the board. End your turn to watch its heavyweight refuse to barge into that dark.',
		rows: [
			'..f.....f...',
			'.....h......',
			'..f.......f.',
			'......f.....',
			'.f.........f',
			'...h....f...',
			'..f.....f...',
		],
		units: [
			{ x: 1, y: 3, unit: SCOUT, team: 0 },
			{ x: 2, y: 1, unit: SCOUT, team: 0 },
			{ x: 1, y: 5, unit: TANK, team: 0 },
			{ x: 8, y: 3, unit: TANK, team: 1 },
			{ x: 9, y: 1, unit: SCOUT, team: 1 },
			{ x: 9, y: 5, unit: HEAVY, team: 1 }, // the unit that should fear the fog
		],
	},
	{
		id: 'ridges',
		name: 'Ridge Country',
		blurb: 'Broken hill terrain with lots of dead ground between sight lines.',
		tip: 'Plenty of fog pockets to vanish into. Snapshot, slip a scout behind a ridge, scan: the hunch tracks the gateway it disappeared through, then widens and fades over successive scans as the CPU loses confidence.',
		rows: [
			'^^..hh..^^..',
			'^..hh..hh..^',
			'..hh....hh..',
			'.h....h...h.',
			'..hh....hh..',
			'^..hh..hh..^',
			'^^..hh..^^..',
		],
		units: [
			{ x: 1, y: 3, unit: SCOUT, team: 0 },
			{ x: 2, y: 5, unit: SCOUT, team: 0 },
			{ x: 0, y: 1, unit: TANK, team: 0 },
			{ x: 10, y: 3, unit: RECON, team: 1 }, // roving sensor
			{ x: 9, y: 1, unit: TANK, team: 1 },
			{ x: 9, y: 5, unit: HEAVY, team: 1 },
		],
	},
	{
		id: 'thicket',
		name: 'The Thicket',
		blurb: 'Dense woods full of blind spots — forest hides its occupants unless you stand beside it.',
		tip: 'A unit can sit unseen in a Forest tile until a viewer is right next to it. Hide a unit in the trees, scan, and watch the CPU value pulling up adjacent to each thicket to peek inside (extra scout weight on Conceals tiles). With Q on, swept woods turn teal — it won’t keep re-checking the same copse until that fades.',
		rows: [
			'.f.ff..ff.f.',
			'ff..f.ff..ff',
			'.f.fff.f.f..',
			'..f..f..ff.f',
			'f.ff.ff..f.f',
			'.ff..f.fff..',
			'f..ff..f.ff.',
		],
		units: [
			{ x: 1, y: 3, unit: SCOUT, team: 0 },
			{ x: 2, y: 5, unit: SCOUT, team: 0 },
			{ x: 1, y: 1, unit: TANK, team: 0 },
			{ x: 10, y: 3, unit: TANK, team: 1 },
			{ x: 9, y: 1, unit: SCOUT, team: 1 },
			{ x: 10, y: 5, unit: HEAVY, team: 1 },
		],
	},
	{
		id: 'lane',
		name: 'The Ambush Lane',
		blurb: 'A single road corridor with a lone CPU forward unit — bait for the kill-into-fog seed.',
		tip: 'Bring a unit up and destroy the CPU’s forward scout in the lane, then scan: with no surviving eyes there, the tile its unit died on goes dark and the CPU seeds a "something lethal is here" belief over the lane mouth — and gets cagey about pushing back in.',
		rows: [
			'^^^^^^^^^^^^',
			'............',
			'rrrrrrrrrrrr',
			'............',
			'^^^^^^^^^^^^',
		],
		units: [
			{ x: 1, y: 2, unit: TANK, team: 0 },
			{ x: 2, y: 1, unit: SCOUT, team: 0 },
			{ x: 5, y: 2, unit: SCOUT, team: 1 }, // lone forward picket — kill it
			{ x: 10, y: 2, unit: HEAVY, team: 1 },
			{ x: 11, y: 3, unit: TANK, team: 1 },
		],
	},
]

export type FogScene = {
	id: string
	name: string
	blurb: string
	tip: string
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

export const fogScenes: FogScene[] = SPECS.map((spec) => ({
	id: spec.id,
	name: spec.name,
	blurb: spec.blurb,
	tip: spec.tip,
	build: () => buildScene(spec),
}))
