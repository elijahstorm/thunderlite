import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'
import type { modifierData } from './modifier'

type TerrainData = ObjectAssetMeta & {
	connector: 0 | 1 | 2 | 3 | 4 | 5
	// Sprite column to show in the map-editor palette. Autotiled terrains (border
	// connector) render their state-0 frame as open water, so Shore would look
	// identical to Sea in the palette. Point it at a coastline frame instead.
	editorState?: number
	// How many interchangeable versions of this terrain's sheet are stacked down the
	// image, each a full `frames` animation loop. A tile picks one from its position
	// (spriteConnector.variantDecision) so a long run of the same terrain stops
	// reading as one motif repeated. Absent (or 1) means a single block, row 0.
	variants?: number
	// Beach: sand that meets the land, as opposed to the open Sea's cliffs. The
	// coastline autotile only sees `ocean`, which cannot tell a beach from deep
	// water — this is what lets a beach know where it runs out and needs to end in a
	// headland rather than spill into the Sea. See spriteConnector.capDecision.
	beach?: boolean
	// Terrains that autotile as ONE body under the connector-5 border, even though
	// they are separate types. The three Ore Deposits share `family: 'ore'` because
	// they are one mineral bed at different stages of being mined out — so a rich
	// patch and a worked-out one share a continuous rim instead of each drawing its
	// own. A terrain that declares no family borders against its own type alone
	// (the Charred Forest scar, Wasteland). See spriteConnector.family.
	family?: string
	name: string
	description: string
	details: 'clean' | 'dirty' | 'rough' | 'slippery' | 'rugged' | 'impassable'
	ocean: boolean
	protection: number
	damage: number
	height: number
	drag: number
	modifiers: (keyof typeof modifierData)[]
}

export const terrainData: TerrainData[] = [
	{
		url: '/game/play/terrain/plains.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		connector: 2,
		name: 'Plains',
		description: 'Basic terrain',
		details: 'dirty',
		ocean: false,
		protection: 0.1,
		damage: 0,
		height: 0,
		drag: 1,
		modifiers: [],
	},
	{
		url: '/game/play/terrain/hills.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		connector: 2,
		name: 'Hills',
		description: 'Gives ranged units an extended range',
		details: 'rough',
		ocean: false,
		protection: 0.2,
		damage: 0,
		height: 20,
		drag: 2,
		modifiers: ['Extra_Sight'],
	},
	{
		url: '/game/play/terrain/forest.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		connector: 2,
		name: 'Forest',
		description: 'Gives a defense boost and hides units inside it from distant enemies in fog',
		details: 'rough',
		ocean: false,
		protection: 0.2,
		damage: 0,
		height: 5,
		drag: 2,
		modifiers: ['Conceals'],
	},
	{
		url: '/game/play/terrain/mountain.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		connector: 2,
		name: 'Mountain',
		description: 'Hard to traverse but gives strong defense',
		details: 'rugged',
		ocean: false,
		protection: 0.4,
		damage: 0,
		height: 50,
		drag: 2,
		modifiers: ['Extra_Sight'],
	},
	{
		url: '/game/play/terrain/road.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		connector: 1,
		name: 'Road',
		description: 'Easy to traverse but provides no defense',
		details: 'clean',
		ocean: false,
		protection: 0,
		damage: 0,
		height: 0,
		drag: 1,
		modifiers: [],
	},
	{
		url: '/game/play/terrain/canyon.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		connector: 1,
		name: 'Canyon',
		description: 'Dips down, but ranged units cannot target here',
		details: 'slippery',
		ocean: false,
		protection: 0.5,
		damage: 0,
		height: -10,
		drag: 1,
		modifiers: ['Trench'],
	},
	{
		url: '/game/play/terrain/wasteland.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		// connector 5 (family-border) with no family declared, so a spill of poisoned
		// ground autotiles against its own type into one contiguous bog — concave
		// junctions between its arms fill instead of leaving notches. 20 columns
		// (16 border states + 4 inner corners) x 5 variant rows of an acid marsh: sour
		// standing water in churned sludge, with the trees it killed still upright in
		// it. The rows differ in how WET they are, so drier tiles between the wet ones
		// keep the water reading as water. Art: tools/sprites/gen_terrain_wasteland.py.
		connector: 5,
		variants: 5,
		// State 0 is fully-enclosed interior, which in the palette reads as bare crust
		// with no edge. Show the isolated tile (state 11) so it looks like one patch.
		editorState: 11,
		name: 'Wasteland',
		description: 'Provides lots of defense, but costs health to rest on',
		details: 'dirty',
		ocean: false,
		protection: 0.5,
		damage: 10,
		height: 0,
		drag: 1,
		modifiers: [],
	},
	{
		url: '/game/play/terrain/volcano.png',
		frames: 1,
		xOffset: 0,
		yOffset: 34,
		connector: 0,
		name: 'Volcano',
		description: 'Impassable',
		details: 'impassable',
		ocean: false,
		protection: 0,
		damage: 0,
		height: 100,
		drag: 100,
		modifiers: [],
	},
	{
		url: '/game/play/terrain/enriched-ore-deposit.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		// The three Ore Deposits are one bed at three stages of being mined out, so
		// they share a family and autotile together: an enriched patch beside a
		// worked-out one reads as a single excavation whose ore runs thin, not as two
		// props side by side. 20 columns (16 border states + 4 inner corners) x 5
		// variant rows. All three sheets share the same rock masses, seams and pockets
		// and differ only in how far the bed has been worked: solid rock with whole
		// seams, then fractures opening as the pockets empty, then loose stone with
		// nothing left. Art: tools/sprites/gen_terrain_ore.py.
		connector: 5,
		family: 'ore',
		variants: 5,
		editorState: 11,
		name: 'Enriched Ore Deposit',
		description: 'Can be mined for money',
		details: 'clean',
		ocean: false,
		protection: 0,
		damage: 0,
		height: 0,
		drag: 1,
		modifiers: [],
	},
	{
		url: '/game/play/terrain/ore-deposit.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		connector: 5,
		family: 'ore',
		variants: 5,
		editorState: 11,
		name: 'Ore Deposit',
		description: 'Can be mined for money',
		details: 'rough',
		ocean: false,
		protection: 0,
		damage: 0,
		height: 0,
		drag: 1,
		modifiers: [],
	},
	{
		url: '/game/play/terrain/depleted-ore-deposit.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		connector: 5,
		family: 'ore',
		variants: 5,
		editorState: 11,
		name: 'Depleted Ore Deposit',
		description: 'Mined out, no funds left',
		details: 'rugged',
		ocean: false,
		protection: 0,
		damage: 0,
		height: 0,
		drag: 1,
		modifiers: [],
	},
	{
		url: '/game/play/terrain/sea.png',
		frames: 3,
		xOffset: 0,
		yOffset: 0,
		connector: 3,
		name: 'Sea',
		description: 'Basic sea terrain',
		details: 'clean',
		ocean: true,
		protection: 0,
		damage: 0,
		height: 0,
		drag: 1,
		modifiers: [],
	},
	{
		url: '/game/play/terrain/reef.png',
		frames: 3,
		xOffset: 0,
		yOffset: 0,
		connector: 0,
		name: 'Reef',
		description: 'Hard to traverse sea terrain',
		details: 'dirty',
		ocean: true,
		protection: 0.1,
		damage: 0,
		height: 10,
		drag: 2,
		modifiers: [],
	},
	{
		url: '/game/play/terrain/archipelago.png',
		frames: 3,
		xOffset: 0,
		yOffset: 0,
		connector: 0,
		name: 'Archipelago',
		description: 'Rough sea terrain',
		details: 'rough',
		ocean: true,
		protection: 0.2,
		damage: 0,
		height: 20,
		drag: 2,
		modifiers: [],
	},
	{
		url: '/game/play/terrain/rock-formation.png',
		frames: 3,
		xOffset: 0,
		yOffset: 0,
		connector: 0,
		name: 'Rock Formation',
		description: 'Rocky sea terrain',
		details: 'rugged',
		ocean: true,
		protection: 0.7,
		damage: 20,
		height: 0,
		drag: 2,
		modifiers: [],
	},
	{
		url: '/game/play/terrain/shore.png',
		frames: 3,
		xOffset: 0,
		yOffset: 0,
		connector: 3,
		editorState: 11,
		// 40 sheet columns (16 border states, 4 inner corners, 8 caps ending an edge's
		// beach and 12 ending an inner corner's — either border or both at once) x 8
		// variants x 3 surf frames — see tools/sprites/gen_terrain_shore.py.
		variants: 8,
		beach: true,
		name: 'Shore',
		description: 'An easy access to the sea',
		details: 'rough',
		ocean: true,
		protection: 0,
		damage: 0,
		height: 0,
		drag: 1,
		modifiers: ['Port', 'Amphibious', 'Shallow'],
	},
	{
		url: '/game/play/terrain/bridge.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		connector: 4,
		name: 'Bridge',
		description: 'Connects two islands, but provides no defense',
		details: 'clean',
		ocean: false,
		protection: 0,
		damage: 0,
		height: 10,
		drag: 1,
		modifiers: [],
	},
	{
		url: '/game/play/terrain/high-bridge.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		connector: 4,
		name: 'High Bridge',
		description: 'Connects two islands, and allows ships to pass, but provides no defense',
		details: 'clean',
		ocean: false,
		protection: 0,
		damage: 0,
		height: 20,
		drag: 1,
		modifiers: ['Amphibious'],
	},
	{
		url: '/game/play/terrain/rampart.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		// connector 2 (random) like Forest / Mountain: a 5-column sheet whose variant
		// is chosen per tile by `location % 5` (see spriteConnector.random). All five
		// are the same riveted steel barricade taking escalating battle damage (pristine,
		// dented, shell-holed, scorched, blown open), so a wall of ramparts reads as one
		// emplacement under fire. Art: tools/sprites/gen_terrain_rampart.py.
		connector: 2,
		name: 'Rampart',
		description: 'A fortified barrier. Impassable, and indirect fire cannot reach past it.',
		details: 'impassable',
		ocean: false,
		protection: 0,
		damage: 0,
		height: 30,
		drag: 1,
		modifiers: ['Bulwark'],
	},
	// Left behind when a Scorcher burns Forest away (see modifiers/burn.ts). Charred
	// stumps and ash — visually the forest that was, not a toxic wasteland. The
	// canopy that concealed and sheltered units is gone, so it grants almost no cover
	// and no concealment, but it isn't poisoned ground, so it costs no health to hold.
	// APPEND-ONLY: terrain is stored by index in saved maps, so this must stay last.
	{
		url: '/game/play/terrain/scorched.png',
		frames: 1,
		xOffset: 0,
		yOffset: 0,
		// connector 5 (family-border): the burn scar declares no family, so it autotiles
		// against other Charred Forest tiles alone, using the Sea's border-plus-inner-
		// corner scheme (matched on terrain family instead of the ocean flag). Concave
		// junctions between arms of a scar fill cleanly instead of leaving jagged
		// notches. 20 columns: 16 border-base states + 4 inner-corner overlays (see
		// spriteConnector / paint), x 4 variant rows. The rows carry the trees that
		// survived standing — a real burn leaves a few big trunks upright in the middle
		// of the scar, not just a fringe of stumps round its edge — kept sparse so a
		// scar shows a scattering of survivors rather than one per tile.
		connector: 5,
		variants: 4,
		name: 'Charred Forest',
		description:
			'Burnt-out woodland — charred stumps and ash. Almost no cover, and no concealment.',
		details: 'rough',
		ocean: false,
		protection: 0.1,
		damage: 0,
		height: 1,
		drag: 2,
		modifiers: [],
	},
]

export const terrainRenderer = imageLazyLoader('ground', terrainData)
