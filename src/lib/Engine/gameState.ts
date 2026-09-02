import { get } from 'svelte/store'
import { shadowable } from './shadowStore'
import { buildingData } from '$lib/GameData/building'
import { unitData } from '$lib/GameData/unit'
import { resetSmoke } from './smokeState'
import { releaseSight } from './fogState'

/**
 * The owner value for an unclaimed (neutral) building. Players are teams 0–3;
 * team 4 has no player and renders with the grey palette (see `imageColorizer`).
 * A neutral building can be captured like any other — it just belongs to nobody
 * until a unit takes it — and never derives a player or insta-loses on capture.
 */
export const NEUTRAL_TEAM = 4

/**
 * How many control buildings of each category the player owns. The first one
 * unlocks building that unit type; each additional one discounts those units
 * when bought with the shared player money pool (see `discountedUnitCost`).
 */
export type PlayerControls = {
	ground: number
	air: number
	sea: number
}

export type Player = {
	team: number
	name?: string
	money: number
	hasLost: boolean
	// Whether this team has ever had a unit on the board. Latches true the first
	// time it fields one and never clears. The "no units left = defeated" rule
	// only applies once this is set, so a side still in its opening build phase
	// (a skirmish map where you start with only buildings and zero units) isn't
	// declared dead before it can build — see winConditions.
	hasFielded?: boolean
	controls?: PlayerControls
	// CPU "memory" of how many stealth units it believes each other team fields,
	// keyed by that team's number. A fuzzy running estimate updated only from what
	// the CPU witnesses (builds, deaths, sightings) — see cpuAi/stealthMemory.ts.
	// Absent until the AI has observed something; clamped >= 0.
	stealthMemory?: Record<number, number>
	// CPU "hunch" about WHERE an enemy cloaked unit is — a fuzzy heat map keyed by
	// tile index. Concrete sightings (a radar flush, a unit seen before it re-cloaks,
	// a factory roll-out) plant heat; each of the CPU's turns the cloud decays and
	// bleeds into neighbouring tiles, so an old sighting widens into a vague region
	// rather than a precise pin. The planner steers probes and radar toward the
	// hottest tile. See `cpuAi/stealthMemory.ts`.
	stealthSuspicion?: Record<number, number>
	// CPU "hunch" about enemies hidden by FOG (not stealth): a heat map of where a
	// contact it lost track of probably is. Seeded when an enemy it had eyes on slips
	// into fog, or when one of its own units is destroyed into the dark; it decays,
	// spreads, and is ruled out where the CPU regains vision. Drives fog caution so the
	// AI stops marching blindly into a region something just vanished into. See
	// `cpuAi/fogMemory.ts`. `fogScan` is the previous turn's vision snapshot it diffs
	// against to detect those transitions.
	fogBelief?: Record<number, number>
	fogScan?: { enemies: number[]; own: number[] }
	// CPU "rule-out" memory: tiles it recently got true eyes into and found empty of
	// enemies (for a Forest/Conceals tile that means standing right beside it). Decays
	// over a few turns so a swept-clear patch eventually becomes worth re-checking
	// again — something could have moved in. Damps the scout drive away from
	// just-searched ground so the CPU expands its search instead of re-treading it.
	fogCleared?: Record<number, number>
}

const emptyControls = (): PlayerControls => ({ ground: 0, air: 0, sea: 0 })

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
			controls[grant]++
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

// Shadowable (see shadowStore.ts) so the CPU's lookahead can apply whole turns to a
// hypothetical copy of this state without the live match, its HUD or its relay ever
// seeing them. Outside a simulation it behaves exactly like a `writable`.
export const gameState = shadowable<GameState>(makeInitialState())

export const derivePlayersFromMap = (map: MapProcesser | MapObject): Player[] => {
	const teams = new Set<number>()
	const teamsWithUnits = new Set<number>()
	for (const u of map.layers.units) {
		if (u && typeof u.team === 'number') {
			teams.add(u.team)
			teamsWithUnits.add(u.team)
		}
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
			// A team that starts with units is already "fielded"; one seeded only by
			// buildings begins in its build phase and is exempt from no-units defeat
			// until it produces something.
			hasFielded: teamsWithUnits.has(team),
			controls: controlsFromBuildings(map, team),
		}))
}

export const initGameStateFromMap = (map: MapProcesser | MapObject): void => {
	resetSmoke()
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
	resetSmoke()
	releaseSight()
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
	// Units that can neither move nor act (e.g. the Blockade) have no possible
	// action — never let them be selected, since doing so just opens an empty
	// flow that does nothing.
	const data = unitData[unit.type]
	if (data && data.movement === 0 && !data.actable) return false
	return true
}
