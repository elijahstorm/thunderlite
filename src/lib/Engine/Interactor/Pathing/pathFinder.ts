import { unitData } from '$lib/GameData/unit'
import { drag } from './movement'

export const pathFinder = (map: MapObject, unit: UnitObject, start: number, end: number) => {
	if (start === end) return []

	const target = map.layers.units[end]
	const targeting = target && target.team !== unit.team && unitData[unit.type].range[0] === 1

	const directions = [-map.cols, map.cols, -1, 1]

	const isValid = (x: number, y: number) => x >= 0 && x < map.cols && y >= 0 && y < map.rows

	const getXY = (tile: number) => ({
		x: tile % map.cols,
		y: Math.floor(tile / map.cols),
	})

	const visited = new Array(map.cols * map.rows).fill(false)
	const queue: { x: number; y: number; path: { tile: number; drag: number }[] }[] = [
		{ ...getXY(start), path: [] },
	]

	while (queue.length > 0) {
		const cur = queue.shift()
		if (!cur) continue

		const { x, y, path } = cur
		const currentDrag = path[path.length - 1]?.drag ?? 0
		const tile = y * map.cols + x

		if (tile === end) {
			if (targeting) {
				if (path.length > 1 && !map.layers.units[path[path.length - 1].tile]) {
					return path
				} else {
					continue
				}
			}
			return path.concat([{ tile, drag: 0 }])
		}

		if (!visited[tile]) {
			visited[tile] = true
			for (const dir of directions) {
				const newTile = tile + dir
				const newXY = getXY(newTile)

				if (
					!isValid(newXY.x, newXY.y) ||
					visited[newXY.y * map.cols + newXY.x] ||
					Math.abs(newXY.x - x) > 1 ||
					Math.abs(newXY.y - y) > 1
				) {
					continue
				}

				const newDrag = currentDrag + drag(unit, map.layers.ground[newTile])

				if (
					(targeting && newTile === end) ||
					(newDrag <= unitData[unit.type].movement &&
						(!map.layers.units[newTile] || map.layers.units[newTile]?.team === unit.team))
				) {
					queue.push({ ...newXY, path: path.concat([{ tile, drag: newDrag }]) })
				}
			}
		}
	}

	return []
}
