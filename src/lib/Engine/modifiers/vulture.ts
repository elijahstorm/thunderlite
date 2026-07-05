import { gameState } from '../gameState'
import { hasModifier } from './canAttack'

const unmarkTileActed = (tile: number): void => {
	gameState.update((state) => {
		if (!state.actedTiles.has(tile)) return state
		const next = new Set(state.actedTiles)
		next.delete(tile)
		return { ...state, actedTiles: next }
	})
}

// Chainable by design: every kill refunds the whole action, so a Vulture can keep
// sweeping as long as each attack destroys its target. Self-terminating (a refresh
// costs an enemy unit) and self-balancing (its low power only finishes wounded prey).
export const applyVultureKill = (attacker: UnitObject, attackerTile: number): boolean => {
	if (!hasModifier(attacker, 'End_Turn.Vulture')) return false
	unmarkTileActed(attackerTile)
	return true
}
