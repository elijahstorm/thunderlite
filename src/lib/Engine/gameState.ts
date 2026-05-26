import { writable, get } from 'svelte/store'
import { buildingData } from '$lib/GameData/building'

export type PlayerControls = {
	ground: boolean
	air: boolean
	sea: boolean
}

export type Player = {
	team: number
	name?: string
	money: number
	hasLost: boolean
	controls?: PlayerControls
}

const emptyControls = (): PlayerControls => ({ ground: false, air: false, sea: false })

const controlForModifier = (modifier: string): keyof PlayerControls | null => {
	if (modifier === 'Capture.Allow_Ground') return 'ground'
	if (modifier === 'Capture.Allow_Air') return 'air'
	if (modifier === 'Capture.Allow_Sea') return 'sea'
	return null
}

export const buildingGrants = (buildingType: number): (keyof PlayerControls)[] => {
	const data = buildingData[buildingType]
	if (!data) return []
	const grants: (keyof PlayerControls)[] = []
	for (const modifier of data.modifiers) {
		const control = controlForModifier(modifier)
		if (control) grants.push(control)
	}
	return grants
}

const controlsFromBuildings = (map: MapProcesser | MapObject, team: number): PlayerControls => {
	const controls = emptyControls()
	for (const building of map.layers.buildings) {
		if (!building || building.team !== team) continue
		for (const grant of buildingGrants(building.type)) {
			controls[grant] = true
		}
	}
	return controls
}

export type GamePhase = 'playing' | 'gameOver'

export type GameState = {
	players: Player[]
	currentTeam: number
	turnNumber: number
	actedTiles: Set<number>
	phase: GamePhase
	winner?: number
}

const makeInitialState = (): GameState => ({
	players: [],
	currentTeam: 0,
	turnNumber: 1,
	actedTiles: new Set<number>(),
	phase: 'playing',
})

export const gameState = writable<GameState>(makeInitialState())

export const derivePlayersFromMap = (map: MapProcesser | MapObject): Player[] => {
	const teams = new Set<number>()
	for (const u of map.layers.units) {
		if (u && typeof u.team === 'number') teams.add(u.team)
	}
	for (const b of map.layers.buildings) {
		if (b && typeof b.team === 'number') teams.add(b.team)
	}
	return [...teams]
		.sort((a, b) => a - b)
		.map((team) => ({
			team,
			money: 0,
			hasLost: false,
			controls: controlsFromBuildings(map, team),
		}))
}

export const initGameStateFromMap = (map: MapProcesser | MapObject): void => {
	const players = derivePlayersFromMap(map)
	gameState.set({
		players,
		currentTeam: players[0]?.team ?? 0,
		turnNumber: 1,
		actedTiles: new Set<number>(),
		phase: 'playing',
	})
}

export const resetGameState = (): void => {
	gameState.set(makeInitialState())
}

export const markTileActed = (tile: number): void => {
	gameState.update((state) => {
		const next = new Set(state.actedTiles)
		next.add(tile)
		return { ...state, actedTiles: next }
	})
}

export const clearActedTiles = (): void => {
	gameState.update((state) => ({ ...state, actedTiles: new Set<number>() }))
}

export const hasTileActed = (tile: number): boolean => get(gameState).actedTiles.has(tile)

export const canSelectUnit = (
	unit: UnitObject,
	tile: number,
	state: GameState = get(gameState)
): boolean => {
	if (state.phase !== 'playing') return false
	if (unit.team !== state.currentTeam) return false
	if (state.actedTiles.has(tile)) return false
	return true
}
