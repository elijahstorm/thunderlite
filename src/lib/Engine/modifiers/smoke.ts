import type { ModifierHandler } from './index'
import { adjacentTiles } from './cloak'
import { addSmoke } from '../smokeState'

// The Shroud lays a screen two turns deep — enough to survive the opponent's turn
// so an advance stays concealed while it crosses open ground.
const SMOKE_TTL = 2

// Move-phase: the Shroud trails a smoke bank over its tile and the four around it
// every time it moves AND at the start of its team's turn (the Move phase fires in
// both — see applyAction.applyMove and turnLoop). So a parked Shroud keeps the
// screen topped up, and an advancing one drags it forward.
export const smoke: ModifierHandler = (target, ctx) => {
	if (ctx.kind !== 'unit') return
	if (!ctx.map) return
	addSmoke([ctx.tile, ...adjacentTiles(ctx.map as MapObject, ctx.tile)], SMOKE_TTL)
}
