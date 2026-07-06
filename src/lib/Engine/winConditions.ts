import { get } from 'svelte/store'
import { buildingGrants, gameState, type GameState } from './gameState'

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

// A team can rebuild an army only from a production building (Ground/Air/Sea
// Control — anything that grants a build permission). A bare Command Center
// does NOT count: it grants nothing, so it can't roll out units.
const teamCanProduce = (map: MapObject | MapProcesser, team: number): boolean => {
	for (const b of map.layers.buildings) {
		if (b && b.team === team && buildingGrants(b.type).length > 0) return true
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
		// A team with no units left is defeated only if it also can't build any —
		// holding a bare Command Center is no reprieve (the CC produces nothing),
		// but a team that still owns a production building can rebuild, so it isn't
		// lost. This is what keeps a fresh skirmish map (both sides start with only
		// factories and zero units) from being declared a DRAW on turn one.
		if (!teamHasUnits(map, player.team) && !teamCanProduce(map, player.team)) {
			losersSet.add(player.team)
		}
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
