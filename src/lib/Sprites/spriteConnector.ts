/* eslint-disable @typescript-eslint/no-unused-vars */
import { terrainData } from '$lib/GameData/terrain'
import { skyData } from '$lib/GameData/sky'

type ConnectionDecision = (map: MapObject, location: number) => number
type CornerDecision = (map: MapObject, location: number) => number[]

// Neighbour-equality readers. `type` matches identical terrain (rollInto / the
// Charred Forest scar), `ocean` matches any water body (the Sea border). Defined up
// here because `flowDecision` binds them into its border decisions at module load.
const type = (map: GroundObject[], location: number) => map[location].type
const ocean = (map: GroundObject[], location: number) => terrainData[map[location].type].ocean
type Reader = typeof type | typeof ocean

export const connectionDecision = (object: GroundObject) =>
	flowDecision[terrainData[object.type].connector]

// A single tile renders one sprite frame, so the base `state` can only ever show
// one of the four inner corners (16=TL, 17=BL, 18=BR, 19=TR). Coastlines like
//   G S G        G S S
//   S S S   or   S S S
//   G S G        G S S
// need several inner corners on the same water tile, so we return the full list
// here and let the renderer composite each corner's quadrant over the base tile.
// connector 3 (Sea) borders against the `ocean` flag so every water terrain reads
// as one body; connector 5 (Charred Forest) borders against terrain *type* so a
// burn scar autotiles only against itself. Both share the border-base + inner-corner
// machinery below, just with a different neighbour-equality reader.
export const cornerDecision = (object: GroundObject): CornerDecision => {
	const connector = terrainData[object.type].connector
	if (connector === 3) return borderCornersWith(ocean)
	if (connector === 5) return borderCornersWith(type)
	return noCorners
}

const noCorners: CornerDecision = () => []

// Inner corners for a border-autotiled tile read against `reader`. A corner is
// needed wherever a *different* neighbour pokes diagonally into a tile whose two
// flanking cardinals both match: the base border state assumes an open diagonal, so
// without this the square's corner would be cut. Judged per corner so it works for
// any shape (fully enclosed → all four, a concave notch → one). For water the
// "different" diagonal is land; for a burn scar it's grass.
const borderCornersWith =
	(reader: Reader): CornerDecision =>
	(map, location) => {
		const l = left(map, location, reader)
		const u = up(map, location, reader)
		const r = right(map, location, reader)
		const d = down(map, location, reader)
		const diag = diagonal(reader)

		const corners: number[] = []
		if (u && l && !diag(-1, -1)(map, location)) corners.push(16) // top-left diagonal differs
		if (d && l && !diag(1, -1)(map, location)) corners.push(17) // bottom-left diagonal differs
		if (d && r && !diag(1, 1)(map, location)) corners.push(18) // bottom-right diagonal differs
		if (u && r && !diag(-1, 1)(map, location)) corners.push(19) // top-right diagonal differs
		return corners
	}

const singular: ConnectionDecision = (map, location) => 0

const rollInto: ConnectionDecision = (map, location) =>
	rollDecision[left(map, location) ? 'true' : 'false'][up(map, location) ? 'true' : 'false'][
		right(map, location) ? 'true' : 'false'
	][down(map, location) ? 'true' : 'false']

const random: ConnectionDecision = (map, location) => location % 5

const borderWith =
	(reader: Reader): ConnectionDecision =>
	(map, location) =>
		borderDecision[left(map, location, reader) ? 'true' : 'false'][
			up(map, location, reader) ? 'true' : 'false'
		][right(map, location, reader) ? 'true' : 'false'][
			down(map, location, reader) ? 'true' : 'false'
		]

const bridge: ConnectionDecision = (map, location) =>
	up(map, location) || down(map, location) ? 1 : 0

// Indexed by TerrainData.connector: 0 singular, 1 rollInto, 2 random, 3 sea-border
// (ocean), 4 bridge, 5 type-border (a scar autotiling against its own type).
const flowDecision: ConnectionDecision[] = [
	singular,
	rollInto,
	random,
	borderWith(ocean),
	bridge,
	borderWith(type),
]

const rollDecision = {
	true: {
		true: {
			true: {
				true: 5,
				false: 6,
			},
			false: {
				true: 4,
				false: 3,
			},
		},
		false: {
			true: {
				true: 8,
				false: 2,
			},
			false: {
				true: 11,
				false: 1,
			},
		},
	},
	false: {
		true: {
			true: {
				true: 7,
				false: 9,
			},
			false: {
				true: 12,
				false: 13,
			},
		},
		false: {
			true: {
				true: 10,
				false: 14,
			},
			false: {
				true: 15,
				false: 0,
			},
		},
	},
}
const borderDecision = {
	true: {
		true: {
			true: {
				true: 0,
				false: 4,
			},
			false: {
				true: 3,
				false: 12,
			},
		},
		false: {
			true: {
				true: 2,
				false: 15,
			},
			false: {
				true: 5,
				false: 8,
			},
		},
	},
	false: {
		true: {
			true: {
				true: 1,
				false: 13,
			},
			false: {
				true: 14,
				false: 9,
			},
		},
		false: {
			true: {
				true: 6,
				false: 7,
			},
			false: {
				true: 10,
				false: 11,
			},
		},
	},
}

// --- Sky-layer autotiling -------------------------------------------------
// Same rollInto scheme as the ground, but neighbours are read off the SKY layer
// and "connected" means the adjacent tile holds the SAME weather type. Only
// weathers with connector 1 (Jetstream) roll into a directional network; every
// other weather stays singular (state 0), so its one-column sheet is untouched.
// The sky layer is sparse (null where there's no weather), so a null neighbour
// simply never matches — the flow ends cleanly at the edge of the band.
const skyEq = (map: MapObject, a: number, b: number) => {
	const here = map.layers.sky[a]?.type
	return here != null && here === map.layers.sky[b]?.type
}
const skyUp = (map: MapObject, l: number) => l - map.cols >= 0 && skyEq(map, l, l - map.cols)
const skyDown = (map: MapObject, l: number) =>
	l + map.cols < map.layers.ground.length && skyEq(map, l, l + map.cols)
const skyLeft = (map: MapObject, l: number) => l % map.cols !== 0 && skyEq(map, l, l - 1)
const skyRight = (map: MapObject, l: number) => (l + 1) % map.cols !== 0 && skyEq(map, l, l + 1)

export const skyConnectionDecision =
	(object: SkyObject) =>
	(map: MapObject, location: number): number =>
		skyData[object.type]?.connector === 1
			? rollDecision[skyLeft(map, location) ? 'true' : 'false'][
					skyUp(map, location) ? 'true' : 'false'
				][skyRight(map, location) ? 'true' : 'false'][skyDown(map, location) ? 'true' : 'false']
			: 0

// Autotiling picks a tile's SHAPE from its neighbours, but a directional weather
// (the Jetstream) also has to run one consistent way along the whole band, or
// each cap and turn animates against its neighbours (a source cap that sucks
// inward, a corner that flows uphill). The sprite bakes ONE flow direction per
// shape; when the actual flow runs the other way we flip it 180° by playing the
// loop backwards (`flowReversed`).
//
// Direction comes from a flow bias — jetstreams run east, then south — so a
// tile's downstream edge is the connected edge with the highest priority below.
// That resolves every straight, corner and cap on a path. Baked directions (from
// gen_weather.py): straight-H flows to R, straight-V to D, a corner flows to its
// vertical edge, a cap flows inward (edge -> centre). We reverse when the baked
// direction disagrees with the bias. Junctions (3+ connections) carry more than
// one flow at once, which a single flip can't express, so they stay unflipped.
const SKY_FLOW_PRIORITY: Record<string, number> = { R: 3, D: 2, U: 1, L: 0 }

export const skyFlowReversed =
	(object: SkyObject) =>
	(map: MapObject, location: number): boolean => {
		if (skyData[object.type]?.connector !== 1) return false
		const l = skyLeft(map, location)
		const u = skyUp(map, location)
		const r = skyRight(map, location)
		const d = skyDown(map, location)
		const count = (l ? 1 : 0) + (u ? 1 : 0) + (r ? 1 : 0) + (d ? 1 : 0)
		if (count === 1) {
			// Cap: the lone edge points at the neighbour. If that neighbour is
			// downstream (east/south) this tile is the SOURCE and must flow OUT, but
			// the sprite flows inward — so reverse. An upstream (west/north) neighbour
			// makes it the sink, which the inward sprite already matches.
			const edge = l ? 'L' : u ? 'U' : r ? 'R' : 'D'
			return edge === 'R' || edge === 'D'
		}
		if (count === 2) {
			if (l && r) return false // straight-H: baked L->R already runs to downstream R
			if (u && d) return false // straight-V: baked U->D already runs to downstream D
			// Corner: sprite flows to its vertical edge; reverse if the horizontal
			// edge is actually the downstream one.
			const vSide = u ? 'U' : 'D'
			const hSide = l ? 'L' : 'R'
			return SKY_FLOW_PRIORITY[hSide] > SKY_FLOW_PRIORITY[vSide]
		}
		return false
	}

const up = (map: MapObject, location: number, reader: typeof type | typeof ocean = type) =>
	location - map.cols >= 0 &&
	reader(map.layers.ground, location - map.cols) === reader(map.layers.ground, location)
const down = (map: MapObject, location: number, reader: typeof type | typeof ocean = type) =>
	location + map.cols < map.layers.ground.length &&
	reader(map.layers.ground, location + map.cols) === reader(map.layers.ground, location)

const left = (map: MapObject, location: number, reader: typeof type | typeof ocean = type) =>
	location % map.cols !== 0 &&
	reader(map.layers.ground, location - 1) === reader(map.layers.ground, location)
const right = (map: MapObject, location: number, reader: typeof type | typeof ocean = type) =>
	(location + 1) % map.cols !== 0 &&
	reader(map.layers.ground, location + 1) === reader(map.layers.ground, location)

// Diagonal neighbour equality against `reader` (ocean flag or terrain type), with
// explicit row/column bounds so a lookup never wraps onto the wrong row or reads
// out of bounds. Used only for inner-corner detection; `false` (treat as a
// different tile) is the safe answer off the edge of the map.
const diagonal =
	(reader: Reader) =>
	(rowDelta: -1 | 1, colDelta: -1 | 1) =>
	(map: MapObject, location: number) => {
		const col = location % map.cols
		if (col + colDelta < 0 || col + colDelta >= map.cols) return false
		const target = location + rowDelta * map.cols + colDelta
		if (target < 0 || target >= map.layers.ground.length) return false
		return reader(map.layers.ground, target) === reader(map.layers.ground, location)
	}
