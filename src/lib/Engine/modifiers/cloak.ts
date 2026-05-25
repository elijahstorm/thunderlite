import type { ModifierContext, ModifierHandler, ModifierTarget } from './index'

export const adjacentTiles = (
	map: Pick<MapObject, 'cols' | 'rows'>,
	tile: number
): number[] => {
	const x = tile % map.cols
	const y = Math.floor(tile / map.cols)
	const tiles: number[] = []
	if (x > 0) tiles.push(tile - 1)
	if (x < map.cols - 1) tiles.push(tile + 1)
	if (y > 0) tiles.push(tile - map.cols)
	if (y < map.rows - 1) tiles.push(tile + map.cols)
	return tiles
}

export const hasAdjacentEnemy = (
	map: MapObject | MapProcesser,
	tile: number,
	team: number
): boolean => {
	for (const adj of adjacentTiles(map, tile)) {
		const other = map.layers.units[adj]
		if (other && other.team !== team) return true
	}
	return false
}

export const cloak: ModifierHandler = (target: ModifierTarget, ctx: ModifierContext): void => {
	if (ctx.kind !== 'unit') return
	if (!ctx.map) return

	const unit = target as UnitObject
	unit.hidden = !hasAdjacentEnemy(ctx.map, ctx.tile, unit.team)
}

export const revealCloakedAdjacentTo = (
	map: MapObject | MapProcesser,
	tile: number,
	moverTeam: number
): void => {
	for (const adj of adjacentTiles(map, tile)) {
		const other = map.layers.units[adj]
		if (!other) continue
		if (other.team === moverTeam) continue
		if (other.hidden) other.hidden = false
	}
}
