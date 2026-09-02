import { get } from 'svelte/store'
import { gameState, derivePlayersFromMap, type GameState } from '$lib/Engine/gameState'
import { fogOfWarEnabled } from '$lib/Engine/fogState'
import { currentMatchSeed, setMatchSeed } from '$lib/Engine/matchSeed'
import { sampleTeams } from '$lib/Engine/matchTimeline'
import {
	applySimulated,
	believedSnapshot,
	runGreedyTurn,
	withSimulated,
	type SimBoard,
} from '$lib/Engine/cpuAi/sim'
import {
	applyTurnPlan,
	searchTurnSync,
	DEFAULT_SEARCH,
	type SearchConfig,
} from '$lib/Engine/cpuAi/search'
import { setCpuWeights, weights, type CpuWeights } from '$lib/Engine/cpuAi/weights'
import type { CpuPolicy } from '$lib/Engine/cpuAi'

/**
 * aiBatch — headless CPU-vs-CPU matches for the /dev/playtest tuning loop.
 *
 * Runs whole games through the simulation substrate with every store shadowed, so a
 * batch can run while a live match sits on the same page without either noticing
 * the other. One game per slice, yielding to the event loop between games so the
 * page stays responsive. Each seat picks a policy (greedy / search), a search config
 * and, optionally, its own weight set, so "search vs greedy" and "weights A vs
 * weights B" are the same runner.
 */

export type BatchSeat = {
	policy: CpuPolicy
	search?: Partial<SearchConfig>
	/** Applied over the defaults before every one of this seat's turns. */
	weights?: Partial<CpuWeights> | null
}

export type BatchConfig = {
	buildMap: () => MapObject
	games: number
	maxRounds: number
	seats: Record<number, BatchSeat>
	fog: boolean
	/** Seeds are `seedBase + game index`, so a run is reproducible. */
	seedBase: number
	/** Swap the seat assignment on odd games so a map asymmetry can't decide it. */
	alternateSeats: boolean
}

export type GameSummary = {
	seed: number
	/** Which seat (config key) each team played as this game. */
	seatOf: Record<number, number>
	winner: number | null
	rounds: number
	/** Final strength (army + funds) per SEAT. */
	strength: Record<number, number>
	nodes: number
	searches: number
	depthSum: number
	ms: number
}

export type BatchSummary = {
	games: GameSummary[]
	/** Wins per SEAT, plus draws / unfinished. */
	wins: Record<number, number>
	draws: number
	avgRounds: number
	/** Mean of (seat 0 strength - seat 1 strength) at the end. */
	avgGap: number
	nodesPerSecond: number
	avgDepth: number
}

const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

const initialState = (map: MapObject): GameState => {
	const players = derivePlayersFromMap(map)
	const startingFunds = Math.max(0, Math.floor(map.funds ?? 0))
	return {
		players: players.map((p) => ({ ...p, money: startingFunds })),
		currentTeam: players[0]?.team ?? 0,
		turnNumber: 1,
		actedTiles: new Set<number>(),
		phase: 'playing',
	}
}

const boardFor = (map: MapObject): SimBoard => ({
	map: {
		...map,
		layers: structuredClone(map.layers),
		route: [],
		highlights: [],
	} as MapObject,
	state: initialState(map),
	smoke: new Map(),
})

const playGame = (
	config: BatchConfig,
	seed: number,
	seatOf: Record<number, number>
): GameSummary => {
	const summary: GameSummary = {
		seed,
		seatOf,
		winner: null,
		rounds: 0,
		strength: {},
		nodes: 0,
		searches: 0,
		depthSum: 0,
		ms: 0,
	}
	const started = performance.now()
	const board = boardFor(config.buildMap())
	const savedWeights: CpuWeights = { ...weights }
	const savedSeed = currentMatchSeed()
	const savedFog = get(fogOfWarEnabled)
	setMatchSeed(seed)
	fogOfWarEnabled.set(config.fog)
	try {
		withSimulated(board, (map) => {
			const teams = get(gameState).players.length
			for (let i = 0; i < config.maxRounds * teams; i++) {
				const state = get(gameState)
				if (state.phase !== 'playing') break
				const team = state.currentTeam
				const seat = config.seats[seatOf[team] ?? team] ?? { policy: 'greedy' }
				setCpuWeights({ ...savedWeights, ...(seat.weights ?? {}) })
				if (seat.policy === 'search') {
					const cfg: SearchConfig = {
						...DEFAULT_SEARCH,
						...seat.search,
						budget: seat.search?.budget ?? DEFAULT_SEARCH.budget,
					}
					const result = searchTurnSync(believedSnapshot(map, team), team, cfg)
					summary.nodes += result.telemetry.nodes
					summary.searches++
					summary.depthSum += result.telemetry.depthCompleted
					applyTurnPlan(map, team, result.plan)
				} else {
					runGreedyTurn(map, team)
				}
				applySimulated(map, { kind: 'end-turn' })
			}
			const state = get(gameState)
			summary.rounds = state.turnNumber
			summary.winner =
				state.phase === 'gameOver' && typeof state.winner === 'number'
					? (seatOf[state.winner] ?? state.winner)
					: null
			const samples = sampleTeams(map, state)
			for (const [teamKey, sample] of Object.entries(samples)) {
				const team = Number(teamKey)
				summary.strength[seatOf[team] ?? team] = sample.army + sample.funds
			}
		})
	} finally {
		setCpuWeights(savedWeights)
		setMatchSeed(savedSeed)
		fogOfWarEnabled.set(savedFog)
	}
	summary.ms = performance.now() - started
	return summary
}

const summarize = (games: GameSummary[]): BatchSummary => {
	const wins: Record<number, number> = {}
	let draws = 0
	let rounds = 0
	let gap = 0
	let nodes = 0
	let ms = 0
	let depth = 0
	let searches = 0
	for (const game of games) {
		if (game.winner === null) draws++
		else wins[game.winner] = (wins[game.winner] ?? 0) + 1
		rounds += game.rounds
		gap += (game.strength[0] ?? 0) - (game.strength[1] ?? 0)
		nodes += game.nodes
		ms += game.ms
		depth += game.depthSum
		searches += game.searches
	}
	const n = Math.max(1, games.length)
	return {
		games,
		wins,
		draws,
		avgRounds: rounds / n,
		avgGap: gap / n,
		nodesPerSecond: ms > 0 ? (nodes / ms) * 1000 : 0,
		avgDepth: searches > 0 ? depth / searches : 0,
	}
}

/**
 * Run the batch. `onProgress` fires after every game with the running summary;
 * `shouldStop` is polled between games. Resolves with the final summary.
 */
export const runBatch = async (
	config: BatchConfig,
	onProgress?: (summary: BatchSummary) => void,
	shouldStop?: () => boolean
): Promise<BatchSummary> => {
	const games: GameSummary[] = []
	const seatKeys = Object.keys(config.seats)
		.map(Number)
		.sort((a, b) => a - b)
	for (let i = 0; i < config.games; i++) {
		if (shouldStop?.()) break
		// Seat assignment: team k plays seat k, or the mirror on odd games.
		const seatOf: Record<number, number> = {}
		seatKeys.forEach((seat, index) => {
			const team =
				config.alternateSeats && i % 2 === 1 ? seatKeys[seatKeys.length - 1 - index] : seat
			seatOf[team] = seat
		})
		games.push(playGame(config, config.seedBase + i, seatOf))
		onProgress?.(summarize(games))
		await breathe()
	}
	return summarize(games)
}
