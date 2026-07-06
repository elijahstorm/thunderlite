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
		// Losing your last unit is a defeat — a surviving factory or Command Center
		// is no reprieve. The one exemption is a team that has never fielded a unit
		// yet (still in its opening build phase on a skirmish map); it hasn't lost
		// an army, it just hasn't built one, so it isn't declared dead. `hasFielded`
		// is what keeps such a map from being called a DRAW on turn one.
		if (player.hasFielded && !teamHasUnits(map, player.team)) losersSet.add(player.team)
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

	// Latch `hasFielded` first: any team that currently has a unit is now (and
	// stays) "fielded", so the moment it builds its first unit it becomes subject
	// to the normal no-units-left defeat. Evaluate against these latched flags so a
	// team that fields and then loses everything in the same pass is still caught.
	const latch = (p: (typeof state.players)[number]) =>
		map && !p.hasFielded && teamHasUnits(map, p.team) ? { ...p, hasFielded: true } : p

	const result = evaluateWinConditions({ ...state, players: state.players.map(latch) }, map)
	const losersSet = new Set(result.losers)

	gameState.update((s) => {
		const players = s.players.map((p) => {
			let next = latch(p)
			if (losersSet.has(next.team) && !next.hasLost) next = { ...next, hasLost: true }
			return next
		})
		const changed = players.some((p, i) => p !== s.players[i])

		if (result.gameOver && s.phase !== 'gameOver') {
			return { ...s, players, phase: 'gameOver', winner: result.winner }
		}
		if (changed) return { ...s, players }
		return s
	})

	return result
}
