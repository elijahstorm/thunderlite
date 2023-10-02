/* eslint-disable @typescript-eslint/no-unused-vars */
import { terrainData } from '$lib/GameData/Terrain'

type ConnectionDecision = (map: MapObject, location: number) => number

export const connectionDecision = (object: GroundObject) =>
	flowDecision[terrainData[object.type].connector]

const singular: ConnectionDecision = (map, location) => 0

const rollInto: ConnectionDecision = (map, location) =>
	rollDecision[left(map, location) ? 'true' : 'false'][up(map, location) ? 'true' : 'false'][
		right(map, location) ? 'true' : 'false'
	][down(map, location) ? 'true' : 'false']

const random: ConnectionDecision = (map, location) => Math.floor(Math.random() * 5)

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
				false: 15, // todo || rotate 1
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
				true: 14, // todo ||
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
const border: ConnectionDecision = (map, location) => {
	const border =
		borderDecision[left(map, location)(ocean) ? 'true' : 'false'][
			up(map, location)(ocean) ? 'true' : 'false'
		][right(map, location)(ocean) ? 'true' : 'false'][down(map, location)(ocean) ? 'true' : 'false']

	if (border === 0) {
		if (!up(map, location + 1)(ocean)) {
			return 19
		}
		if (!down(map, location + 1)(ocean)) {
			return 18
		}
		if (!down(map, location - 1)(ocean)) {
			return 17
		}
		if (!up(map, location - 1)(ocean)) {
			return 16
		}
	}

	return border
}

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

const type = (map: GroundObject[], location: number) => map[location].type
const ocean = (map: GroundObject[], location: number) => terrainData[map[location].type].ocean

const up =
	(map: MapObject, location: number) =>
	(reader: typeof type | typeof ocean = type) =>
		location - map.rows >= 0 &&
		reader(map.layers.ground, location - map.rows) === reader(map.layers.ground, location)
const down = (map: MapObject, location: number) => (reader: typeof type | typeof ocean) =>
	location + map.rows < map.layers.ground.length &&
	reader(map.layers.ground, location + map.rows) === reader(map.layers.ground, location)

const left = (map: MapObject, location: number) => (reader: typeof type | typeof ocean) =>
	location % map.rows !== 0 &&
	reader(map.layers.ground, location - 1) === reader(map.layers.ground, location)
const right = (map: MapObject, location: number) => (reader: typeof type | typeof ocean) =>
	(location + 1) % map.rows !== 0 &&
	reader(map.layers.ground, location + 1) === reader(map.layers.ground, location)
