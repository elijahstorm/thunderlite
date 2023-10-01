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

// const cornerDecision = {
// 	true: {
// 		true: {
// 			true: 0,
// 			false: 5,
// 		},
// 		false: {
// 			true: 0,
// 			false: 0,
// 		},
// 	},
// 	false: {
// 		true: ,
// 		false: ,
// 	},
// }
const border: ConnectionDecision = (map, location) => {
	if (
		left(map, location)(details) &&
		up(map, location)(details) &&
		!up(map, location - 1)(details)
	) {
		return 5
	}
	if (
		left(map, location)(details) &&
		down(map, location)(details) &&
		!down(map, location - 1)(details)
	) {
		return 6
	}

	return Math.floor(Math.random() * 12)
}
const old = () => {
	if (x != 0)
		if (Terrain_Data.TERRE[_map[x - 1][y]].Type != connector)
			if (Terrain_Data.TERRE[_map[x - 1][y]].Type != type) {
				// border to left
				if (x != _map.length - 1)
					if (Terrain_Data.TERRE[_map[x + 1][y]].Type != connector)
						if (Terrain_Data.TERRE[_map[x + 1][y]].Type != type) {
							// border to right
							if (y != 0)
								if (Terrain_Data.TERRE[_map[x][y - 1]].Type != connector)
									if (Terrain_Data.TERRE[_map[x][y - 1]].Type != type) {
										// border to top
										if (y != _map[x].length - 1)
											if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
												if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
													// border to bottom
													__img = Terrain_Data.TERRE[index].Borders[9]
													__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
													__sprite = merge(
														cornerImg,
														imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
													)

													return [__ANIMATION, __sprite]
												}
										__img = Terrain_Data.TERRE[index].Borders[8]
										__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
										__sprite = merge(
											cornerImg,
											imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
										)

										return [__ANIMATION, __sprite]
									}
							if (y != _map[x].length - 1)
								if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
									if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
										// border to bottom
										__img = Terrain_Data.TERRE[index].Borders[7]
										__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
										__sprite = merge(
											cornerImg,
											imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
										)

										return [__ANIMATION, __sprite]
									}
							__img = Terrain_Data.TERRE[index].Borders[1]
							imageHolderCanvas.save()
							imageHolderCanvas.scale(-1, 1)
							imageHolderCanvas.translate(-TILESIZE, 0)

							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							imageHolderCanvas.restore()
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)

							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

							return [__ANIMATION, __sprite]
						}
				if (y != 0)
					if (Terrain_Data.TERRE[_map[x][y - 1]].Type != connector)
						if (Terrain_Data.TERRE[_map[x][y - 1]].Type != type) {
							// border to top
							if (y != _map[x].length - 1)
								if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
									if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
										// border to bottom
										__img = Terrain_Data.TERRE[index].Borders[6]
										imageHolderCanvas.save()
										imageHolderCanvas.scale(-1, 1)
										imageHolderCanvas.translate(-TILESIZE, 0)

										__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
										__sprite = merge(
											cornerImg,
											imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
										)
										imageHolderCanvas.restore()

										return [__ANIMATION, __sprite]
									}
							__img = Terrain_Data.TERRE[index].Borders[3]
							imageHolderCanvas.save()
							imageHolderCanvas.scale(-1, 1)
							imageHolderCanvas.translate(-TILESIZE, 0)

							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))
							imageHolderCanvas.restore()

							return [__ANIMATION, __sprite]
						}
				if (y != _map[x].length - 1)
					if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
						if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
							// border to bottom
							__img = Terrain_Data.TERRE[index].Borders[10]
							imageHolderCanvas.save()
							imageHolderCanvas.scale(-1, 1)
							imageHolderCanvas.translate(-TILESIZE, 0)

							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))
							imageHolderCanvas.restore()

							return [__ANIMATION, __sprite]
						}
				__img = Terrain_Data.TERRE[index].Borders[1]
				imageHolderCanvas.save()
				imageHolderCanvas.rotate((180 * Math.PI) / 180)
				imageHolderCanvas.translate(-TILESIZE, -TILESIZE)

				__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
				__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))
				imageHolderCanvas.restore()

				return [__ANIMATION, __sprite]
			}
	if (x != _map.length - 1)
		if (Terrain_Data.TERRE[_map[x + 1][y]].Type != connector)
			if (Terrain_Data.TERRE[_map[x + 1][y]].Type != type) {
				// border to right
				if (y != 0)
					if (Terrain_Data.TERRE[_map[x][y - 1]].Type != connector)
						if (Terrain_Data.TERRE[_map[x][y - 1]].Type != type) {
							// border to top
							if (y != _map[x].length - 1)
								if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
									if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
										// border to bottom
										__img = Terrain_Data.TERRE[index].Borders[6]
										__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
										__sprite = merge(
											cornerImg,
											imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
										)

										return [__ANIMATION, __sprite]
									}
							__img = Terrain_Data.TERRE[index].Borders[3]
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

							return [__ANIMATION, __sprite]
						}
				if (y != _map[x].length - 1)
					if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
						if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
							// border to bottom
							__img = Terrain_Data.TERRE[index].Borders[10]
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

							return [__ANIMATION, __sprite]
						}
				__img = Terrain_Data.TERRE[index].Borders[1]
				__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
				__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

				return [__ANIMATION, __sprite]
			}
	if (y != 0)
		if (Terrain_Data.TERRE[_map[x][y - 1]].Type != connector)
			if (Terrain_Data.TERRE[_map[x][y - 1]].Type != type) {
				// border to top
				if (y != _map[x].length - 1)
					if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
						if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
							// border to bottom
							__img = Terrain_Data.TERRE[index].Borders[0]
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							cornerImg = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))
							__img = Terrain_Data.TERRE[index].Borders[2]
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

							return [__ANIMATION, __sprite]
						}
				__img = Terrain_Data.TERRE[index].Borders[0]
				__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
				__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

				return [__ANIMATION, __sprite]
			}
	if (y != _map[x].length - 1)
		if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
			if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
				// border to bottom
				__img = Terrain_Data.TERRE[index].Borders[2]
				__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
				__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

				return [__ANIMATION, __sprite]
			}

	return [__ANIMATION, cornerImg]
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
const details = (map: GroundObject[], location: number) => terrainData[map[location].type].details

const up =
	(map: MapObject, location: number) =>
	(reader: typeof type | typeof details = type) =>
		location - map.rows >= 0 &&
		reader(map.layers.ground, location - map.rows) === reader(map.layers.ground, location)
const down = (map: MapObject, location: number) => (reader: typeof type | typeof details) =>
	location + map.rows < map.layers.ground.length &&
	reader(map.layers.ground, location + map.rows) === reader(map.layers.ground, location)

const left = (map: MapObject, location: number) => (reader: typeof type | typeof details) =>
	location % map.rows !== 0 &&
	reader(map.layers.ground, location - 1) === reader(map.layers.ground, location)
const right = (map: MapObject, location: number) => (reader: typeof type | typeof details) =>
	(location + 1) % map.rows !== 0 &&
	reader(map.layers.ground, location + 1) === reader(map.layers.ground, location)
