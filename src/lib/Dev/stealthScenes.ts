import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { deriveFromData } from '$lib/Map/Editor/mapExporter'

// Authoring playground scenes for the stealth / fog-of-war experiments. Same ASCII
// + placement format as the LOS scenes (see losScenes.ts), compiled through
// deriveFromData so the board renders and plays for real against the CPU.
//
// Each scene is built to expose a specific interaction between cloakable units
// (Stealth Tank, U-Boat) and the CPU AI — both how the AI perceives them under fog
// and how it reacts when it (can't) see them. Pair each scene with the live
// concealment readout on the page.

const terrain = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`stealth scene: unknown terrain "${name}"`)
	return idx
}
const unitType = (name: string): number => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`stealth scene: unknown unit "${name}"`)
	return idx
}

// ground glyphs → terrain
const GLYPH: Record<string, number> = {
	'.': terrain('Plains'),
	r: terrain('Road'),
	f: terrain('Forest'),
	'^': terrain('Hills'),
	'~': terrain('Sea'),
	s: terrain('Shore'),
}

const STEALTH = unitType('Stealth Tank') // cloaks itself at end of turn (no adjacent enemy)
const UBOAT = unitType('U-Boat') // naval cloak
const SCOUT = unitType('Strike Commando') // Move.Tracking — reveals adjacent hidden enemies
const RADAR = unitType('Jammer Truck') // Move.Radar — reveals hidden enemies in range on move
const HUNTER = unitType('Hunter Support') // sea, Move.Tracking
const TANK = unitType('Scorpion Tank') // direct ground bruiser
const CORVETTE = unitType('Corvette') // direct warship

type Placement = { x: number; y: number; unit: number; team: number }

type SceneSpec = {
	id: string
	name: string
	blurb: string
	/** What to do / what to watch — shown under the scene picker. */
	tip: string
	rows: string[]
	units: Placement[]
}

const SPECS: SceneSpec[] = [
	{
		id: 'open',
		name: 'Stealth in the Open',
		blurb: 'A lone Stealth Tank on bare plains, an advancing CPU armour column on the far side.',
		tip: 'Fog ON: your Stealth Tank is concealed from team 1 until one of their units gets adjacent (or its tile enters their sight). Watch the readout flip as the CPU closes in. Fog OFF: the CPU targets it immediately — the AI attack list respects tile-visibility, not the hidden flag, so it effectively sees through stealth.',
		rows: [
			'............',
			'............',
			'......f.....',
			'............',
			'............',
			'............',
			'............',
			'............',
			'............',
		],
		units: [
			{ x: 4, y: 4, unit: STEALTH, team: 0 },
			{ x: 2, y: 7, unit: SCOUT, team: 0 },
			{ x: 8, y: 4, unit: TANK, team: 1 },
			{ x: 9, y: 6, unit: SCOUT, team: 1 },
		],
	},
	{
		id: 'blind',
		name: 'Blind CPU Advance',
		blurb: 'A CPU column with no idea where you are — a clean look at how the AI moves under fog.',
		tip: 'No stealth here: just fog. Spectate or end your turn and watch the CPU advance. Under fog it cannot target units outside its sight diamond, but its movement is driven by open-information scoring (closest-enemy / objective distance), so it still pushes purposefully. Switch "View as" to team 1 to see the board through the CPU\'s own fog.',
		rows: [
			'............',
			'..^^....^^..',
			'............',
			'rrrrrrrrrrrr',
			'............',
			'..^^....^^..',
			'............',
		],
		units: [
			{ x: 1, y: 3, unit: STEALTH, team: 0 },
			{ x: 0, y: 0, unit: SCOUT, team: 0 },
			{ x: 11, y: 3, unit: TANK, team: 1 },
			{ x: 10, y: 0, unit: SCOUT, team: 1 },
			{ x: 10, y: 6, unit: SCOUT, team: 1 },
		],
	},
	{
		id: 'radar',
		name: 'Radar Sweep',
		blurb: 'A CPU Jammer Truck (radar) that flushes hidden units out of cloak when it repositions.',
		tip: 'Team 1 fields a Jammer Truck. Move.Radar reveals hidden enemies inside its weapon range whenever it moves — end your turn and watch your Stealth Tank\'s "hidden" flag drop in the readout after the CPU\'s radar truck repositions, even across open ground and even under fog.',
		rows: [
			'............',
			'............',
			'............',
			'............',
			'............',
			'............',
			'............',
		],
		units: [
			{ x: 3, y: 3, unit: STEALTH, team: 0 },
			{ x: 2, y: 5, unit: SCOUT, team: 0 },
			{ x: 10, y: 3, unit: TANK, team: 1 },
			{ x: 9, y: 5, unit: RADAR, team: 1 },
		],
	},
	{
		id: 'submarine',
		name: 'Submarine Screen',
		blurb: 'U-Boats below the surface against a CPU sea tracker and a warship.',
		tip: 'U-Boats hide underwater. The CPU\'s Hunter Support is a sea tracker — it reveals an adjacent sub when it moves, and the Corvette then closes for the kill. With fog OFF the CPU engages the subs on sight. Try moving a U-Boat: its path ghosts straight through a concealed enemy and stops on contact.',
		rows: [
			'~~~~~~~~~~~~',
			'~~~~~~~~~~~~',
			'~~~~ss~~~~~~',
			'~~~~ss~~~~~~',
			'~~~~~~~~~~~~',
			'~~~~~~~~~~~~',
			'ssssssssssss',
		],
		units: [
			{ x: 3, y: 2, unit: UBOAT, team: 0 },
			{ x: 6, y: 4, unit: UBOAT, team: 0 },
			{ x: 10, y: 2, unit: HUNTER, team: 1 },
			{ x: 9, y: 4, unit: CORVETTE, team: 1 },
		],
	},
]

export type StealthScene = {
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

export const stealthScenes: StealthScene[] = SPECS.map((spec) => ({
	id: spec.id,
	name: spec.name,
	blurb: spec.blurb,
	tip: spec.tip,
	build: () => buildScene(spec),
}))
