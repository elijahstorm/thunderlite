import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { deriveFromData } from '$lib/Map/Editor/mapExporter'

// Playground scenes for watching the CPU *react* to cloaked enemies it believes are
// lurking: it builds radar (Jammer Truck), sends cheap probes toward where it last
// "saw" one, and screens its valuable units. Same ASCII + placement format as the
// other dev scenes (see stealthScenes.ts / losScenes.ts), compiled through
// deriveFromData so the board plays for real against the live AI.
//
// Each scene leans on a different terrain theme so they don't blur together, and the
// land scenes give the CPU (team 1) a Warfactory + Ground Control + funds so it can
// actually build the radar/scouts the hunt logic wants. Brief the CPU from the page,
// then end your turn (or spectate) and watch it hunt.

const terrain = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`hunt scene: unknown terrain "${name}"`)
	return idx
}
const unitType = (name: string): number => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`hunt scene: unknown unit "${name}"`)
	return idx
}
const buildingType = (name: string): number => {
	const idx = buildingData.findIndex((b) => b.name === name)
	if (idx < 0) throw new Error(`hunt scene: unknown building "${name}"`)
	return idx
}

// ground glyphs → terrain
const GLYPH: Record<string, number> = {
	'.': terrain('Plains'),
	r: terrain('Road'),
	f: terrain('Forest'),
	'^': terrain('Mountain'),
	h: terrain('Hills'),
	c: terrain('Canyon'),
	w: terrain('Wasteland'),
	v: terrain('Volcano'),
	o: terrain('Ore Deposit'),
	O: terrain('Enriched Ore Deposit'),
	'~': terrain('Sea'),
	R: terrain('Reef'),
	a: terrain('Archipelago'),
	x: terrain('Rock Formation'),
	s: terrain('Shore'),
	b: terrain('Bridge'),
}

const STEALTH = unitType('Stealth Tank')
const SCOUT = unitType('Strike Commando') // cheap, mobile, has sight — the CPU's ideal probe
const TANK = unitType('Scorpion Tank') // direct ground bruiser
const HEAVY = unitType('Annihilator Tank') // expensive — the kind of unit worth screening
const UBOAT = unitType('U-Boat') // naval cloak
const HUNTER = unitType('Hunter Support') // sea tracker — flushes adjacent subs on move
const CORVETTE = unitType('Corvette') // direct warship

const WARFACTORY = buildingType('Warfactory') // actable producer
const GROUND_CTRL = buildingType('Ground Control') // unlocks ground production
const SEA_CTRL = buildingType('Sea Control') // unlocks sea production
const CITY = buildingType('City') // income, so the CPU keeps a budget

type UnitPlace = { x: number; y: number; unit: number; team: number }
type BuildingPlace = { x: number; y: number; building: number; team: number }

type SceneSpec = {
	id: string
	name: string
	blurb: string
	tip: string
	fog: boolean
	funds: number
	rows: string[]
	units: UnitPlace[]
	buildings: BuildingPlace[]
}

// A CPU (team 1) ground production base: Warfactory + Ground Control + a City.
const cpuBase = (x: number, y: number): BuildingPlace[] => [
	{ x, y, building: WARFACTORY, team: 1 },
	{ x, y: y + 1, building: GROUND_CTRL, team: 1 },
	{ x: x + 1, y, building: CITY, team: 1 },
]

const SPECS: SceneSpec[] = [
	{
		id: 'forest',
		name: 'Forest Hollow',
		blurb: 'A wooded basin laced with trails — stealth tanks melt into the treeline.',
		tip: 'The forest gives the stealth tanks cover to lurk in. Brief the CPU, then end your turn: it should build a Jammer Truck and walk scouts up the trails toward the heat, sweeping the woods rather than charging blind.',
		fog: false,
		funds: 6000,
		rows: [
			'f.fhh..rr..f.f',
			'.ff.h.r..r.ff.',
			'f..ffr....fr.h',
			'h...r.ff.r....',
			'rr.r..ff..r.rr',
			'h...r.ff.r....',
			'f..ffr....fr.h',
			'.ff.h.r..r.ff.',
			'f.fhh..rr..f.f',
		],
		units: [
			{ x: 2, y: 2, unit: STEALTH, team: 0 },
			{ x: 3, y: 6, unit: STEALTH, team: 0 },
			{ x: 1, y: 4, unit: SCOUT, team: 0 },
			{ x: 13, y: 3, unit: TANK, team: 1 },
			{ x: 13, y: 5, unit: SCOUT, team: 1 },
		],
		buildings: cpuBase(11, 3),
	},
	{
		id: 'pass',
		name: 'Mountain Pass',
		blurb: 'Sheer ranges with a single switchback canyon road — the obvious place to screen.',
		tip: 'A Stealth Tank waits by the pass. After briefing, value the CPU parking a Jammer Truck so its ring covers the canyon (and shelters whatever funnels through), instead of feeding its column into the dark. Try fog on/off to compare.',
		fog: false,
		funds: 6000,
		rows: [
			'^^^^hh..hh^^^^',
			'^^hhc....chh^^',
			'^hh.cc..cc.hh^',
			'h..c..rr..c..h',
			'rrrr..rr..rrrr',
			'h..c..rr..c..h',
			'^hh.cc..cc.hh^',
			'^^hhc....chh^^',
			'^^^^hh..hh^^^^',
		],
		units: [
			{ x: 4, y: 4, unit: STEALTH, team: 0 },
			{ x: 1, y: 4, unit: SCOUT, team: 0 },
			{ x: 12, y: 4, unit: TANK, team: 1 },
		],
		buildings: cpuBase(11, 2),
	},
	{
		id: 'refinery',
		name: 'Wasteland Refinery',
		blurb: 'A cracked ore field around a smoking volcano — industrial, open, and exposed.',
		tip: "Lots of value on the board (ore, the CPU's economy) and little cover. After briefing, the CPU should both push a radar/probe at the heat and weigh screening its assets — the wasteland gives ambushers few places to hide once it starts sweeping.",
		fog: false,
		funds: 7000,
		rows: [
			'w.woo.ww.ow.w',
			'.wwo.wwww.oww.',
			'wo.w.wvvw.w.ow',
			'w.wwwwvvwwww.w',
			'.o.ww.ww.ww.o.',
			'w.wwwwvvwwww.w',
			'wo.w.wvvw.w.ow',
			'.wwo.wwww.oww.',
			'w.woo.ww.ow.w',
		],
		units: [
			{ x: 2, y: 2, unit: STEALTH, team: 0 },
			{ x: 3, y: 6, unit: STEALTH, team: 0 },
			{ x: 0, y: 4, unit: SCOUT, team: 0 },
			{ x: 11, y: 4, unit: HEAVY, team: 1 },
			{ x: 12, y: 6, unit: SCOUT, team: 1 },
		],
		buildings: cpuBase(11, 1),
	},
	{
		id: 'river',
		name: 'River Crossing',
		blurb: 'A river splits the field; bridges are the only way over — stealth haunts the banks.',
		tip: 'Land on both banks, water down the middle, bridges as the pinch points. Brief the CPU and watch it value covering a crossing with radar and probing the near bank, rather than blindly committing across a bridge a Stealth Tank could be camping.',
		fog: false,
		funds: 6000,
		rows: [
			'f..h..~~..h..f',
			'.ff...~~...ff.',
			'..frrrbbrrrf..',
			'h.....~~.....h',
			'..f...~~...f..',
			'h.....~~.....h',
			'..frrrbbrrrf..',
			'.ff...~~...ff.',
			'f..h..~~..h..f',
		],
		units: [
			{ x: 3, y: 3, unit: STEALTH, team: 0 },
			{ x: 2, y: 5, unit: STEALTH, team: 0 },
			{ x: 0, y: 4, unit: SCOUT, team: 0 },
			{ x: 12, y: 3, unit: TANK, team: 1 },
			{ x: 13, y: 5, unit: SCOUT, team: 1 },
		],
		buildings: cpuBase(11, 1),
	},
	{
		id: 'naval',
		name: 'Naval Patrol',
		blurb: 'Open water dotted with reefs and atolls — U-Boats stalk a CPU surface fleet.',
		tip: 'Sea battle: your U-Boats are the cloak threat. Radar (Jammer Truck) is a land unit, so at sea the CPU hunts with its Hunter Support tracker (flushes adjacent subs on the move) and corvettes probing toward the heat. Brief it, then end your turn and watch the fleet sweep the atolls.',
		fog: false,
		funds: 5000,
		rows: [
			'~~~R~~~~~~R~~~',
			'~~aa~~~RR~~aa~',
			'~~as~~~~~~sa~~',
			'~~~~~xx~~~~~~~',
			'R~~~~xx~~~~~~R',
			'~~~~~xx~~~~~~~',
			'~~as~~~~~~sa~~',
			'~~aa~~~RR~~aa~',
			'~~~R~~~~~~R~~~',
		],
		units: [
			{ x: 3, y: 4, unit: UBOAT, team: 0 },
			{ x: 5, y: 2, unit: UBOAT, team: 0 },
			{ x: 1, y: 6, unit: UBOAT, team: 0 },
			{ x: 11, y: 3, unit: HUNTER, team: 1 },
			{ x: 12, y: 4, unit: CORVETTE, team: 1 },
			{ x: 11, y: 5, unit: CORVETTE, team: 1 },
		],
		// Island base on the eastern atoll so the CPU can still build a corvette or two.
		buildings: [
			{ x: 11, y: 1, building: WARFACTORY, team: 1 },
			{ x: 11, y: 2, building: SEA_CTRL, team: 1 },
			{ x: 12, y: 1, building: CITY, team: 1 },
		],
	},
]

export type HuntScene = {
	id: string
	name: string
	blurb: string
	tip: string
	fog: boolean
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
	const buildings = spec.buildings.map((b) => ({
		type: b.building,
		team: b.team,
		l: b.y * cols + b.x,
	}))
	return deriveFromData({
		title: spec.name,
		cols,
		rows: height,
		fog: spec.fog,
		funds: spec.funds,
		layers: { ground, sky: [], units, buildings },
	} as unknown as MapData)
}

export const huntScenes: HuntScene[] = SPECS.map((spec) => ({
	id: spec.id,
	name: spec.name,
	blurb: spec.blurb,
	tip: spec.tip,
	fog: spec.fog,
	build: () => buildScene(spec),
}))
