// Scenes and case enumerations for the /dev/shore playground.
//
// A coastline is drawn per TILE but has to read as one continuous line across a
// whole map, so what breaks is never a tile — it is a BORDER between two of them.
// Everything here is therefore built to put a particular border on screen: the
// enumerations vary exactly the neighbours that decide how each side of it is
// drawn, and hold the rest still.

import { terrainData } from '$lib/GameData/terrain'

const index = (name: string) => terrainData.findIndex((t) => t.name === name)

export const PLAINS = index('Plains')
export const FOREST = index('Forest')
export const MOUNTAIN = index('Mountain')
export const SEA = index('Sea')
export const SHORE = index('Shore')
export const REEF = index('Reef')
export const BRIDGE = index('Bridge')

/** The terrains worth painting on this page, in palette order. */
export const PALETTE = [
	{ type: PLAINS, key: '.', label: 'Plains' },
	{ type: FOREST, key: 'f', label: 'Forest' },
	{ type: MOUNTAIN, key: 'm', label: 'Mountain' },
	{ type: SHORE, key: 'S', label: 'Shore' },
	{ type: SEA, key: '~', label: 'Sea' },
	{ type: REEF, key: 'r', label: 'Reef' },
	{ type: BRIDGE, key: 'b', label: 'Bridge' },
]

const BY_KEY = new Map(PALETTE.map((p) => [p.key, p.type]))
const BY_TYPE = new Map(PALETTE.map((p) => [p.type, p.key]))

/** A grid of terrain indices, which is all the canvas renderer needs. */
export type Patch = { cols: number; rows: number; tiles: number[] }

/** Build a patch from an ASCII picture, using the palette's single-char keys. */
export const patch = (picture: string[]): Patch => ({
	cols: picture[0].length,
	rows: picture.length,
	tiles: picture.flatMap((row) => [...row].map((c) => BY_KEY.get(c) ?? PLAINS)),
})

export const toPicture = (p: Patch): string[] =>
	Array.from({ length: p.rows }, (_, r) =>
		p.tiles
			.slice(r * p.cols, (r + 1) * p.cols)
			.map((t) => BY_TYPE.get(t) ?? '.')
			.join('')
	)

/** Round-trips a painted board through the URL so a broken layout can be shared. */
export const encode = (p: Patch) => `${p.cols}x${p.rows}:${toPicture(p).join('/')}`
export const decode = (s: string): Patch | null => {
	const m = /^(\d+)x(\d+):(.*)$/.exec(s)
	if (!m) return null
	const cols = Number(m[1])
	const rows = m[3].split('/')
	if (rows.length !== Number(m[2]) || rows.some((r) => r.length !== cols)) return null
	return patch(rows)
}

// --- case enumerations -----------------------------------------------------

export type Case = { id: string; label: string; patch: Patch }

const CARDINAL_KEYS = ['.', 'S', '~'] as const
const CARDINAL_NAME: Record<string, string> = { '.': 'land', S: 'shore', '~': 'sea' }

/**
 * Every neighbourhood a Shore tile can sit in, as far as its own frame is
 * concerned: the four cardinals decide its border state (land or water) AND
 * whether each side needs an end cap (water that is not itself beach), which is
 * three distinct answers per side — 81 in all.
 *
 * The diagonals only ever matter as land-or-water, and only where both of their
 * flanking cardinals are water, so they are a separate axis: `corners` is a
 * 4-bit mask (bit 0 top-left, then clockwise) picked by the caller.
 */
export const cardinalCases = (corners: number, diagonalWater = '~'): Case[] => {
	const out: Case[] = []
	const dg = (bit: number) => (corners & (1 << bit) ? diagonalWater : '.')
	for (const up of CARDINAL_KEYS)
		for (const right of CARDINAL_KEYS)
			for (const down of CARDINAL_KEYS)
				for (const left of CARDINAL_KEYS)
					out.push({
						id: `${up}${right}${down}${left}`,
						label: `↑${CARDINAL_NAME[up]} →${CARDINAL_NAME[right]} ↓${CARDINAL_NAME[down]} ←${CARDINAL_NAME[left]}`,
						patch: patch([
							`${dg(0)}${up}${dg(3)}`,
							`${left}S${right}`,
							`${dg(1)}${down}${dg(2)}`,
						]),
					})
	return out
}

/**
 * The inner-corner pockets on their own: a Shore tile with water on all four
 * sides, and land poking in across every combination of the four diagonals. This
 * is the sand that comes from a corner overlay rather than an edge band, which is
 * the case the end caps could not see for a long time.
 */
export const pocketCases = (water: string): Case[] =>
	Array.from({ length: 16 }, (_, mask) => {
		const d = (bit: number) => (mask & (1 << bit) ? '.' : water)
		const named = ['TL', 'BL', 'BR', 'TR'].filter((_, b) => mask & (1 << b))
		return {
			id: `pocket-${mask}`,
			label: named.length ? `land ${named.join(' ')}` : 'open water',
			patch: patch([`${d(0)}${water}${d(3)}`, `${water}S${water}`, `${d(1)}${water}${d(2)}`]),
		}
	})

/**
 * One straight coast per direction, with the water alternating Shore, Sea, Shore
 * in runs — so every beach/cliff handover appears twice, once in each direction.
 */
export const strips = (): Case[] => {
	const rows = ['SS~~SSS~S~~S']
	const flipH = (p: string[]) => p.map((r) => [...r].reverse().join(''))
	const transpose = (p: string[]) =>
		Array.from({ length: p[0].length }, (_, c) => p.map((r) => r[c]).join(''))
	const north = ['............', ...rows, '~~~~~~~~~~~~']
	const south = ['~~~~~~~~~~~~', ...rows, '............']
	return [
		{ id: 'coast-n', label: 'land to the north', patch: patch(north) },
		{ id: 'coast-s', label: 'land to the south', patch: patch(south) },
		{ id: 'coast-w', label: 'land to the west', patch: patch(transpose(north)) },
		{ id: 'coast-e', label: 'land to the east', patch: patch(flipH(transpose(north))) },
	]
}

/** Shapes a real map actually makes, where several borders meet at once. */
export const SHAPES: Case[] = [
	{
		id: 'island',
		label: 'Island ringed by beach, rocky south shore',
		patch: patch([
			'~~~~~~~',
			'~SSSS~~',
			'~S..S~~',
			'~S..S~~',
			'~S~~S~~',
			'~~~~~~~',
		]),
	},
	{
		id: 'column',
		label: 'Land column, beach both sides, sea beyond',
		patch: patch([
			'~~~~~~~',
			'~~S.S~~',
			'~SS.SS~',
			'~~S.S~~',
			'~~S~S~~',
			'~~~~~~~',
		]),
	},
	{
		id: 'bay',
		label: 'Ragged bay: beach carrying round every turn',
		patch: patch([
			'.......',
			'...SS..',
			'.SSSSS.',
			'SSS~~SS',
			'S~~~~~S',
			'~~~~~~~',
		]),
	},
	{
		id: 'peninsula',
		label: 'Peninsula: beach on three sides, sea at the tip',
		patch: patch([
			'~~~~~~~',
			'~~SSS~~',
			'~~S.S~~',
			'~SS.SS~',
			'~S...S~',
			'.......',
		]),
	},
	{
		id: 'channel',
		label: 'One-tile channel, half beach half open sea',
		patch: patch([
			'...~...',
			'...S...',
			'...S...',
			'...~...',
			'...~...',
			'...S...',
		]),
	},
	{
		id: 'lagoon',
		label: 'Lone tiles: a lagoon, an islet and a lone sea hole',
		patch: patch([
			'.......',
			'..S....',
			'.......',
			'...~...',
			'.......',
			'.S.S.~.',
		]),
	},
	{
		id: 'diagonal',
		label: 'Diagonal coast: pockets on every step',
		patch: patch([
			'.......',
			'..SS~~~',
			'...SS~~',
			'....SS~',
			'.....SS',
			'......S',
		]),
	},
	{
		id: 'checker',
		label: 'Checkerboard: every pocket at once (worst case)',
		patch: patch([
			'.~.~.~.',
			'~S~S~S~',
			'.~.~.~.',
			'~S~S~S~',
			'.~.~.~.',
		]),
	},
	{
		id: 'reef-bridge',
		label: 'Reef and a bridge deck crossing a beach',
		patch: patch([
			'.......',
			'SSSbSSS',
			'~~r~~r~',
			'~~~~~~~',
		]),
	},
	{
		id: 'inlet',
		label: 'Inlet cutting inland, beach one side sea the other',
		patch: patch([
			'.......',
			'..S~...',
			'..S~...',
			'.SS~~..',
			'SS~~~~.',
			'~~~~~~~',
		]),
	},
]
