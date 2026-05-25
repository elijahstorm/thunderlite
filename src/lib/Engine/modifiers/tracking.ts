import type { ModifierContext, ModifierHandler, ModifierTarget } from './index'
import { adjacentTiles } from './cloak'

export const tracking: ModifierHandler = (target: ModifierTarget, ctx: ModifierContext): void => {
	if (ctx.kind !== 'unit') return
	if (!ctx.map) return

	const unit = target as UnitObject
	for (const adj of adjacentTiles(ctx.map, ctx.tile)) {
		const enemy = ctx.map.layers.units[adj]
		if (!enemy) continue
		if (enemy.team === unit.team) continue
		if (enemy.hidden) enemy.hidden = false
	}
}
