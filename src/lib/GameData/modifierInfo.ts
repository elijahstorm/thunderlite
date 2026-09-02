import { modifierData, type ModifierPhase } from './modifier'

export type ModifierKey = keyof typeof modifierData

// Visual grouping for badges. Many distinct phases collapse into a handful of
// categories so the at-a-glance HUD reads as a small, color-coded set rather
// than a wall of identical chips.
export type ModifierCategory =
	'trait' | 'turn' | 'capture' | 'move' | 'aura' | 'utility' | 'combat' | 'death'

type CategoryStyle = {
	label: string
	glyph: string
	// Tailwind classes for the condensed badge.
	badge: string
	// Accent color for the expanded detail header.
	accent: string
}

const phaseToCategory: Record<ModifierPhase, ModifierCategory> = {
	Properties: 'trait',
	Start_Turn: 'turn',
	End_Turn: 'turn',
	Each_Turn: 'turn',
	Capture: 'capture',
	Move: 'move',
	Idle: 'aura',
	Self_Action: 'utility',
	Can_Attack: 'combat',
	Damage: 'combat',
	Attack: 'combat',
	Death: 'death',
}

export const categoryStyles: Record<ModifierCategory, CategoryStyle> = {
	trait: {
		label: 'Trait',
		glyph: '◆',
		badge: 'bg-slate-400/20 text-slate-100 hover:bg-slate-400/30',
		accent: 'text-slate-300',
	},
	turn: {
		label: 'Upkeep',
		glyph: '↻',
		badge: 'bg-indigo-400/20 text-indigo-100 hover:bg-indigo-400/30',
		accent: 'text-indigo-300',
	},
	capture: {
		label: 'Capture',
		glyph: '⚑',
		badge: 'bg-amber-400/20 text-amber-100 hover:bg-amber-400/30',
		accent: 'text-amber-300',
	},
	move: {
		label: 'Movement',
		glyph: '➜',
		badge: 'bg-sky-400/20 text-sky-100 hover:bg-sky-400/30',
		accent: 'text-sky-300',
	},
	aura: {
		label: 'Aura',
		glyph: '◎',
		badge: 'bg-teal-400/20 text-teal-100 hover:bg-teal-400/30',
		accent: 'text-teal-300',
	},
	utility: {
		label: 'Utility',
		glyph: '⚙',
		badge: 'bg-purple-400/20 text-purple-100 hover:bg-purple-400/30',
		accent: 'text-purple-300',
	},
	combat: {
		label: 'Combat',
		glyph: '⚔',
		badge: 'bg-red-400/20 text-red-100 hover:bg-red-400/30',
		accent: 'text-red-300',
	},
	death: {
		label: 'On Death',
		glyph: '☠',
		badge: 'bg-rose-500/20 text-rose-100 hover:bg-rose-500/30',
		accent: 'text-rose-300',
	},
}

// Human-readable "when does this fire" line shown in the expanded detail.
const phaseTiming: Record<ModifierPhase, string> = {
	Properties: 'Passive trait',
	Start_Turn: 'At the start of its turn',
	End_Turn: 'At the end of its turn',
	Each_Turn: 'Every turn',
	Capture: 'When captured',
	Move: 'While moving',
	Idle: 'While stationary',
	Self_Action: 'Special action',
	Can_Attack: 'When attacking',
	Damage: 'When dealing damage',
	Attack: 'When attacking',
	Death: 'When destroyed',
}

// The raw keys carry a phase prefix and the occasional typo. Override display
// labels here; everything else derives a label from the key automatically.
const labelOverrides: Partial<Record<ModifierKey, string>> = {
	'Can_Attack.Ground_Assult': 'Ground Assault',
}

// Plain-language "how it works" copy surfaced when a badge is expanded.
const descriptions: Partial<Record<ModifierKey, string>> = {
	hidden: 'Concealed from enemies until something reveals it.',
	treacherous: 'Hazardous terrain that can damage units crossing it.',
	Extra_Sight: 'Sees further than normal, extending vision range.',
	Trench: 'Dug-in cover that improves the defense of units standing here.',
	Bulwark: 'A solid wall. Indirect fire cannot reach a unit sheltered behind it.',
	Conceals: 'Hides units standing on this tile from enemy sight.',
	Amphibious: 'Can travel across both land and water.',
	Shallow: 'Shallow water that some land and naval units can pass through.',
	Port: 'Lets naval units dock here to resupply and repair.',
	Storm_Rider:
		'Built for the tempest: storm cells neither damage this aircraft nor slow its flight.',
	'Start_Turn.Heal_Team':
		'At the owner’s turn start, repairs a friendly unit on this building by 10 HP, or deals 10 damage to an enemy camping it.',
	'Capture.Insta_Lose': 'If this property is captured, its former owner is instantly defeated.',
	'Capture.Allow_Ground':
		'Lets the owner build ground units. Each extra one held cuts ground unit prices by 10%, up to 50%.',
	'Capture.Allow_Air':
		'Lets the owner build air units. Each extra one held cuts air unit prices by 10%, up to 50%.',
	'Capture.Allow_Sea':
		'Lets the owner build naval units. Each extra one held cuts naval unit prices by 10%, up to 50%.',
	'Each_Turn.Supply_Income':
		'Pays out income each turn, drawing from its reserves and trickling a reduced amount once drained.',
	'Start_Turn.Capture':
		'Automatically chips away at any enemy property it stands on at the start of each turn. Attacking last turn skips that turn’s capture.',
	'Move.Tracking': 'Reveals adjacent hidden enemies as it moves past them.',
	'Self_Action.Transport': 'Can load and carry other units.',
	'Self_Action.Repairable': 'Can be repaired and resupplied at a friendly base.',
	'Can_Attack.Air_Raid': 'Specialized strike that targets air units.',
	'Damage.Flak': 'Anti-air fire that deals extra damage to aircraft.',
	'Damage.Fast_Attack': 'Strikes quickly, landing extra damage on the opening blow.',
	'Can_Attack.Bombard': 'Indirect fire from a distance that draws no counterattack.',
	'Attack.Lance': 'Piercing strike that is especially effective against armor.',
	'Attack.Stun': 'Attacks can stun the target, limiting what it can do next turn.',
	'End_Turn.Cloak': 'Cloaks itself at the end of the turn whenever no enemy is adjacent.',
	'Damage.Slow_Attack': 'Hits hard but is sluggish to act.',
	'Damage.Stealth_Strike': 'Deals bonus damage when attacking from concealment.',
	'Can_Attack.Counter_Range': 'Can return fire even against attackers striking from range.',
	'Move.Radar':
		'Sweeps the surrounding area as it moves, revealing hidden enemies within its range.',
	'Idle.Jamming':
		'While stationary, its jamming field walls off the surrounding airspace, blocking enemy aircraft from flying through it.',
	'Self_Action.Miner': 'Can mine resources from the terrain.',
	'Self_Action.Builder': 'Can construct structures or fortifications.',
	'Death.Insta_Lose':
		'If this unit is destroyed and its owner has no fallback, that player is instantly defeated.',
	'Can_Attack.Ground_Assult': 'Specialized assault that targets ground units.',
	'Self_Action.Irreparable': 'Cannot be repaired once it takes damage.',
	'End_Turn.Vulture':
		'Acts again whenever its attack destroys the target, chaining kills as long as each shot finishes its prey.',
	'Self_Action.Land': 'Can land to deploy or switch modes.',
	'Self_Action.Ship_Out': 'Can deploy from or board a transport or port.',
	'Damage.Highground':
		'Deals dramatically more damage the higher it stands above its target — devastating from a peak, ordinary on the flat.',
	'Damage.Aegis':
		'Projects a protective field: friendly units standing next to it take less damage.',
	'Damage.Siege':
		'Arcs its shells straight past terrain cover, so dug-in defenders get no shelter and take the full hit.',
	'Attack.Splash':
		'Its attack washes over every tile around the target, dealing splash damage to anything beside it.',
	'Attack.Burn': 'Sets the struck area alight, scorching forest cover away into burnt wasteland.',
	'Move.Smoke':
		'Trails a concealing smoke screen over itself and the tiles around it as it advances.',
}

export type ModifierDisplay = {
	key: ModifierKey
	label: string
	category: ModifierCategory
	glyph: string
	timing: string
	description: string
}

const defaultLabel = (key: ModifierKey): string => {
	const dot = key.indexOf('.')
	const tail = dot >= 0 ? key.slice(dot + 1) : key
	return tail.replace(/_/g, ' ')
}

export const modifierDisplay = (key: ModifierKey): ModifierDisplay => {
	const phase = modifierData[key].phase
	const category = phaseToCategory[phase]
	const timing = phaseTiming[phase]
	return {
		key,
		label: labelOverrides[key] ?? defaultLabel(key),
		category,
		glyph: categoryStyles[category].glyph,
		timing,
		description: descriptions[key] ?? `${timing}.`,
	}
}
