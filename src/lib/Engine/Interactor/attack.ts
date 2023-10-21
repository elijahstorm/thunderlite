export const generateAttackList = (map: MapObject, tile: number, unit: UnitObject) => [
	...new Set<number>(increment(map, unit, tile)),
]

// range = [start, end]

const increment: (map: MapObject, unit: UnitObject, tile: number) => number[] = (
	map,
	unit,
	tile
) => [...[tile + 1], ...[tile - 1], ...[tile - map.cols], ...[tile + map.cols]]
