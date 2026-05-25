import { unitData } from '$lib/GameData/unit'
import type { ModifierContext, ModifierHandler, ModifierTarget } from './index'

export const tilesInRange = (
	map: Pick<MapObject, 'cols' | 'rows'>,
	tile: number,
	min: number,
	max: number
): number[] => {
	const cx = tile % map.cols
	const cy = Math.floor(tile / map.cols)
	const tiles: number[] = []
	for (let dy = -max; dy <= max; dy++) {
		const remaining = max - Math.abs(dy)
		const y = cy + dy
		if (y < 0 || y >= map.rows) continue
		for (let dx = -remaining; dx <= remaining; dx++) {
			const dist = Math.abs(dx) + Math.abs(dy)
			if (dist < min) continue
			const x = cx + dx
			if (x < 0 || x >= map.cols) continue
			tiles.push(y * map.cols + x)
		}
	}
	return tiles
}

export const radar: ModifierHandler = (target: ModifierTarget, ctx: ModifierContext): void => {
	if (ctx.kind !== 'unit') return
	if (!ctx.map) return

	const unit = target as UnitObject
	const [min, max] = unitData[unit.type]?.range ?? [2, 3]

	for (const adj of tilesInRange(ctx.map, ctx.tile, min, max)) {
		const enemy = ctx.map.layers.units[adj]
		if (!enemy) continue
		if (enemy.team === unit.team) continue
		if (enemy.hidden) enemy.hidden = false
	}
}
