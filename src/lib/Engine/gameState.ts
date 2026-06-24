import { writable, get } from 'svelte/store'
import { buildingData } from '$lib/GameData/building'

/**
 * The owner value for an unclaimed (neutral) building. Players are teams 0–3;
 * team 4 has no player and renders with the grey palette (see `imageColorizer`).
 * A neutral building can be captured like any other — it just belongs to nobody
 * until a unit takes it — and never derives a player or insta-loses on capture.
 */
export const NEUTRAL_TEAM = 4

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
	// CPU "memory" of how many stealth units it believes each other team fields,
	// keyed by that team's number. A fuzzy running estimate updated only from what
	// the CPU witnesses (builds, deaths, sightings) — see cpuAi/stealthMemory.ts.
	// Absent until the AI has observed something; clamped >= 0.
	stealthMemory?: Record<number, number>
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
		if (b && typeof b.team === 'number' && b.team !== NEUTRAL_TEAM) teams.add(b.team)
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
	const startingFunds = Math.max(0, Math.floor(map.funds ?? 0))
	gameState.set({
		players: players.map((p) => ({ ...p, money: startingFunds })),
		currentTeam: players[0]?.team ?? 0,
		turnNumber: 1,
		actedTiles: new Set<number>(),
		phase: 'playing',
	})
}

/**
 * Recompute every player's build permissions from the buildings they currently
 * own. Call after a scripted building add/remove/ownership change so the build
 * menu reflects the new state without re-deriving (and resetting) the players.
 */
export const refreshControlsFromMap = (map: MapProcesser | MapObject): void => {
	gameState.update((state) => ({
		...state,
		players: state.players.map((p) => ({ ...p, controls: controlsFromBuildings(map, p.team) })),
	}))
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
