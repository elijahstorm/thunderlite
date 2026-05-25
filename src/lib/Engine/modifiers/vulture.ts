import { get } from 'svelte/store'
import { gameState } from '../gameState'
import { hasModifier } from './canAttack'

const vultureBonusTurn = new WeakMap<UnitObject, number>()

const unmarkTileActed = (tile: number): void => {
	gameState.update((state) => {
		if (!state.actedTiles.has(tile)) return state
		const next = new Set(state.actedTiles)
		next.delete(tile)
		return { ...state, actedTiles: next }
	})
}

export const applyVultureKill = (attacker: UnitObject, attackerTile: number): boolean => {
	if (!hasModifier(attacker, 'End_Turn.Vulture')) return false
	const turn = get(gameState).turnNumber
	if (vultureBonusTurn.get(attacker) === turn) return false
	vultureBonusTurn.set(attacker, turn)
	unmarkTileActed(attackerTile)
	return true
}
