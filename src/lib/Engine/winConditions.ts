import { get } from 'svelte/store'
import { gameState, type GameState } from './gameState'

export type WinConditionsResult = {
	gameOver: boolean
	winner?: number
	losers: number[]
}

const teamHasUnits = (map: MapObject | MapProcesser, team: number): boolean => {
	for (const u of map.layers.units) {
		if (u && u.team === team) return true
	}
	return false
}

export const evaluateWinConditions = (
	state: GameState,
	map?: MapObject | MapProcesser
): WinConditionsResult => {
	if (state.players.length === 0) return { gameOver: false, losers: [] }

	const losersSet = new Set<number>()
	for (const player of state.players) {
		if (player.hasLost) {
			losersSet.add(player.team)
			continue
		}
		if (!map) continue
		// A team with no units left is defeated, even if they still hold an
		// uncaptured Command Center — the CC can't rebuild an army (it isn't a
		// production building), so an army-less player has no way back.
		if (!teamHasUnits(map, player.team)) losersSet.add(player.team)
	}

	const losers = state.players.map((p) => p.team).filter((t) => losersSet.has(t))
	const survivors = state.players.filter((p) => !losersSet.has(p.team))

	if (state.players.length >= 2 && survivors.length <= 1 && losers.length > 0) {
		const winner = survivors.length === 1 ? survivors[0].team : undefined
		return { gameOver: true, winner, losers }
	}

	return { gameOver: false, losers }
}

export const applyWinConditions = (map?: MapObject | MapProcesser): WinConditionsResult => {
	const state = get(gameState)
	const result = evaluateWinConditions(state, map)
	const losersSet = new Set(result.losers)

	gameState.update((s) => {
		const needsPlayerUpdate = s.players.some((p) => losersSet.has(p.team) && !p.hasLost)
		const players = needsPlayerUpdate
			? s.players.map((p) => (losersSet.has(p.team) && !p.hasLost ? { ...p, hasLost: true } : p))
			: s.players

		if (result.gameOver && s.phase !== 'gameOver') {
			return {
				...s,
				players,
				phase: 'gameOver',
				winner: result.winner,
			}
		}
		if (needsPlayerUpdate) {
			return { ...s, players }
		}
		return s
	})

	return result
}
