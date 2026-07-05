import { refreshControlsFromMap } from '$lib/Engine/gameState'
import type { ModifierContext, ModifierHandler, ModifierTarget } from './index'

// Controls are per-category building COUNTS (first unlocks, extras discount),
// so a capture can't just flip a flag on the two involved teams. The building
// has already changed hands by the time modifiers run, which means the map is
// the source of truth: recount every player's controls from it.
const recountControls: ModifierHandler = (_target: ModifierTarget, ctx: ModifierContext): void => {
	if (ctx.kind !== 'building') return
	if (!ctx.map) return
	refreshControlsFromMap(ctx.map)
}

export const captureAllowGround: ModifierHandler = recountControls
export const captureAllowAir: ModifierHandler = recountControls
export const captureAllowSea: ModifierHandler = recountControls
