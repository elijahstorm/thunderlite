import { get } from 'svelte/store'
import { gameState, type GameState, type Player } from './gameState'
import { runModifiers, type ModifierContext, type ModifierPhase } from './modifiers'

export type NextTeamResult = {
	team: number
	wrapped: boolean
}

export const nextActiveTeam = (
	players: readonly Player[],
	currentTeam: number
): NextTeamResult | null => {
	if (players.length === 0) return null
	const eligible = players.filter((p) => !p.hasLost)
	if (eligible.length === 0) return null

	const currentIndex = players.findIndex((p) => p.team === currentTeam)
	const startIndex = currentIndex >= 0 ? currentIndex : -1

	for (let step = 1; step <= players.length; step++) {
		const idx = ((startIndex + step) % players.length + players.length) % players.length
		const candidate = players[idx]
		if (candidate.hasLost) continue
		const wrapped = startIndex < 0 ? false : idx <= startIndex
		return { team: candidate.team, wrapped }
	}
	return null
}

const forEachTileTarget = (
	layer: readonly (UnitObject | null)[] | readonly (BuildingObject | null)[],
	team: number,
	cb: (target: UnitObject | BuildingObject, tile: number) => void
): void => {
	for (let tile = 0; tile < layer.length; tile++) {
		const entry = layer[tile]
		if (!entry) continue
		if (entry.team !== team) continue
		cb(entry, tile)
	}
}

const runPhaseForTeam = (
	map: MapObject | MapProcesser,
	team: number,
	phase: ModifierPhase,
	kinds: readonly ('unit' | 'building')[],
	state: GameState
): void => {
	for (const kind of kinds) {
		const layer = kind === 'unit' ? map.layers.units : map.layers.buildings
		forEachTileTarget(layer, team, (target, tile) => {
			const ctx: ModifierContext = { kind, tile, state, map }
			runModifiers(target, phase, ctx)
		})
	}
}

export type EndTurnOptions = {
	map?: MapObject | MapProcesser
}

export const endTurn = ({ map }: EndTurnOptions = {}): void => {
	const before = get(gameState)
	if (before.phase !== 'playing') return

	if (map) {
		runPhaseForTeam(map, before.currentTeam, 'End_Turn', ['unit'], before)
	}

	const advance = nextActiveTeam(before.players, before.currentTeam)
	if (!advance) return

	gameState.update((state) => ({
		...state,
		currentTeam: advance.team,
		turnNumber: advance.wrapped ? state.turnNumber + 1 : state.turnNumber,
		actedTiles: new Set<number>(),
	}))

	if (map) {
		const after = get(gameState)
		runPhaseForTeam(map, advance.team, 'Start_Turn', ['unit', 'building'], after)
		runPhaseForTeam(map, advance.team, 'Each_Turn', ['unit', 'building'], after)
	}
}
