import { gameState } from '$lib/Engine/gameState'
import type { ModifierContext, ModifierHandler, ModifierTarget } from './index'

export const captureInstaLose: ModifierHandler = (
	_target: ModifierTarget,
	ctx: ModifierContext
): void => {
	if (ctx.kind !== 'building') return
	if (typeof ctx.previousTeam !== 'number') return

	const previousTeam = ctx.previousTeam
	gameState.update((s) => ({
		...s,
		players: s.players.map((p) =>
			p.team === previousTeam && !p.hasLost ? { ...p, hasLost: true } : p
		),
	}))
}
