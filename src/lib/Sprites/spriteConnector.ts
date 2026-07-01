/* eslint-disable @typescript-eslint/no-unused-vars */
import { terrainData } from '$lib/GameData/terrain'

type ConnectionDecision = (map: MapObject, location: number) => number
type CornerDecision = (map: MapObject, location: number) => number[]

export const connectionDecision = (object: GroundObject) =>
	flowDecision[terrainData[object.type].connector]

// A single tile renders one sprite frame, so the base `state` can only ever show
// one of the four inner corners (16=TL, 17=BL, 18=BR, 19=TR). Coastlines like
//   G S G        G S S
//   S S S   or   S S S
//   G S G        G S S
// need several inner corners on the same water tile, so we return the full list
// here and let the renderer composite each corner's quadrant over the base tile.
export const cornerDecision = (object: GroundObject): CornerDecision =>
	terrainData[object.type].connector === 3 ? borderCorners : noCorners

const noCorners: CornerDecision = () => []

const borderCorners: CornerDecision = (map, location) => {
	// An inner corner is needed wherever land pokes diagonally into the water: the
	// two cardinal neighbours flanking that corner are both ocean, but the diagonal
	// between them is land. Each corner is judged on its own so this works for any
	// shape — a fully-enclosed tile (all four corners), a concave lake corner (one),
	// and crucially a moat ring's corner tiles, which face the protected interior on
	// their inner diagonal yet are NOT fully enclosed, so the base `border` state
	// (which assumes open water diagonally) would otherwise cut the square's corners.
	const l = left(map, location, ocean)
	const u = up(map, location, ocean)
	const r = right(map, location, ocean)
	const d = down(map, location, ocean)

	const corners: number[] = []
	if (u && l && !upLeft(map, location)) corners.push(16) // top-left diagonal is land
	if (d && l && !downLeft(map, location)) corners.push(17) // bottom-left diagonal is land
	if (d && r && !downRight(map, location)) corners.push(18) // bottom-right diagonal is land
	if (u && r && !upRight(map, location)) corners.push(19) // top-right diagonal is land
	return corners
}

const singular: ConnectionDecision = (map, location) => 0

const rollInto: ConnectionDecision = (map, location) =>
	rollDecision[left(map, location) ? 'true' : 'false'][up(map, location) ? 'true' : 'false'][
		right(map, location) ? 'true' : 'false'
	][down(map, location) ? 'true' : 'false']

const random: ConnectionDecision = (map, location) => location % 5

const border: ConnectionDecision = (map, location) =>
	borderDecision[left(map, location, ocean) ? 'true' : 'false'][
		up(map, location, ocean) ? 'true' : 'false'
	][right(map, location, ocean) ? 'true' : 'false'][down(map, location, ocean) ? 'true' : 'false']

const bridge: ConnectionDecision = (map, location) =>
	up(map, location) || down(map, location) ? 1 : 0

const flowDecision: [
	ConnectionDecision,
	ConnectionDecision,
	ConnectionDecision,
	ConnectionDecision,
	ConnectionDecision,
] = [singular, rollInto, random, border, bridge]

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

const type = (map: GroundObject[], location: number) => map[location].type
const ocean = (map: GroundObject[], location: number) => terrainData[map[location].type].ocean

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

// Diagonal neighbours read against the `ocean` flag, with explicit row- and
// column-bounds checks so a lookup never wraps onto the wrong row or reads
// out of bounds. Used only for inner-corner detection; `false` (treat as land)
// is the safe answer off the edge of the map.
const diagonal =
	(rowDelta: -1 | 1, colDelta: -1 | 1) =>
	(map: MapObject, location: number) => {
		const col = location % map.cols
		if (col + colDelta < 0 || col + colDelta >= map.cols) return false
		const target = location + rowDelta * map.cols + colDelta
		if (target < 0 || target >= map.layers.ground.length) return false
		return ocean(map.layers.ground, target) === ocean(map.layers.ground, location)
	}
const upLeft = diagonal(-1, -1)
const upRight = diagonal(-1, 1)
const downLeft = diagonal(1, -1)
const downRight = diagonal(1, 1)
