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
	// Inner corners only apply to fully-enclosed water — a tile whose four cardinal
	// neighbours are all the same ocean. Edge tiles already draw their land
	// transition through the base `border` state, so the diagonal lookups below are
	// always in-bounds and on the same row when this guard passes.
	if (
		!(
			left(map, location, ocean) &&
			up(map, location, ocean) &&
			right(map, location, ocean) &&
			down(map, location, ocean)
		)
	) {
		return []
	}

	const corners: number[] = []
	if (!up(map, location - 1, ocean)) corners.push(16) // top-left diagonal is land
	if (!down(map, location - 1, ocean)) corners.push(17) // bottom-left diagonal is land
	if (!down(map, location + 1, ocean)) corners.push(18) // bottom-right diagonal is land
	if (!up(map, location + 1, ocean)) corners.push(19) // top-right diagonal is land
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
