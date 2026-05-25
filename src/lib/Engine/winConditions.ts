import { get } from 'svelte/store'
import { buildingData } from '$lib/GameData/building'
import { gameState, type GameState } from './gameState'

const COMMAND_CENTER_TYPE = buildingData.findIndex((b) => b.name === 'Command Center')

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

const teamHasCommandCenter = (map: MapObject | MapProcesser, team: number): boolean => {
	for (const b of map.layers.buildings) {
		if (!b) continue
		if (b.team !== team) continue
		if (b.type === COMMAND_CENTER_TYPE) return true
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
		const hasUnits = teamHasUnits(map, player.team)
		const hasCC = teamHasCommandCenter(map, player.team)
		if (!hasUnits && !hasCC) losersSet.add(player.team)
	}

	const losers = state.players.map((p) => p.team).filter((t) => losersSet.has(t))
	const survivors = state.players.filter((p) => !losersSet.has(p.team))

	if (state.players.length >= 2 && survivors.length <= 1 && losers.length > 0) {
		const winner = survivors.length === 1 ? survivors[0].team : undefined
		return { gameOver: true, winner, losers }
	}

	return { gameOver: false, losers }
}

export const applyWinConditions = (
	map?: MapObject | MapProcesser
): WinConditionsResult => {
	const state = get(gameState)
	const result = evaluateWinConditions(state, map)
	const losersSet = new Set(result.losers)

	gameState.update((s) => {
		const needsPlayerUpdate = s.players.some(
			(p) => losersSet.has(p.team) && !p.hasLost
		)
		const players = needsPlayerUpdate
			? s.players.map((p) =>
					losersSet.has(p.team) && !p.hasLost ? { ...p, hasLost: true } : p
				)
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
