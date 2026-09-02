import { get } from 'svelte/store'
import { gameState, type GameState } from '../gameState'
import { smokeTiles } from '../smokeState'
import { applyAction } from '../applyAction'
import { bestPlanFor } from './candidates'
import { pickBuildOnce } from './production'
import { beginCpuPlanning, endCpuPlanning, planningUnits } from './planningContext'
import { concealedEnemyTiles } from '../visibility'
import type { SerializedAction } from '../Interactor/serializedAction'

/**
 * sim — the headless substrate the CPU's lookahead runs on.
 *
 * The engine mutates `map.layers` in place and keeps the rest of the match in
 * module-global stores, so "what happens if I play this whole turn?" used to be
 * unanswerable without touching the live game. A {@link SimBoard} is a private copy
 * of both halves — the layers, the game state (money, acted tiles, the CPU's fog and
 * stealth memory on the player records) and the smoke — and {@link withSimulated}
 * runs a function against it with the engine's stores SHADOWED (see
 * shadowStore.ts): every `applyAction`, `endTurn`, scorer and memo inside reads and
 * writes the copy, and nothing it does is visible to the live match, its HUD or the
 * relay. Simulated actions are applied with `{ simulated: true }` so the remaining
 * side effects (dev log, explosion animation, build fades) stay quiet too.
 *
 * Determinism: nothing here draws randomness of its own. The greedy policy below is
 * the exact tick loop `runCpuTurn` plays, minus animation and relay, so a simulated
 * turn is the turn the CPU would really play from that board (same seeded draws).
 */

export type SimBoard = {
	/** A fresh `MapObject`-shaped wrapper around cloned layers. Never the live map. */
	map: MapObject
	/** The board's own copy of the game state. Updated by every simulated action. */
	state: GameState
	/** The board's own copy of the smoke screens. */
	smoke: Map<number, number>
}

/**
 * The layers, the active game state and the smoke, copied. The wrapper is a NEW
 * object every time: memo caches keyed on the map reference (`fogMemory.visCache`,
 * the planning context) must never confuse two boards.
 */
export const snapshot = (map: MapObject, state: GameState = get(gameState)): SimBoard => ({
	map: wrap(map, structuredClone(map.layers)),
	state: structuredClone(state),
	smoke: new Map(get(smokeTiles)),
})

/**
 * The board as `observer` BELIEVES it: a snapshot with every enemy unit the observer
 * cannot perceive (fog, stealth, sky cover) removed. This is what the search plans
 * on — it never cheats fog. The observer's own units are always all present, and its
 * fog hunch (`fogBelief`) rides along in the cloned state so the evaluator can charge
 * for the enemies it suspects but can't see.
 */
export const believedSnapshot = (
	map: MapObject,
	observer: number,
	state: GameState = get(gameState)
): SimBoard => {
	const board = snapshot(map, state)
	const concealed = concealedEnemyTiles(map, observer)
	for (const tile of concealed) {
		const unit = board.map.layers.units[tile]
		if (unit && unit.team !== observer) board.map.layers.units[tile] = null
	}
	return board
}

/** Copy an existing snapshot (a child node of the search). */
export const cloneBoard = (board: SimBoard): SimBoard => ({
	map: wrap(board.map, structuredClone(board.map.layers)),
	state: structuredClone(board.state),
	smoke: new Map(board.smoke),
})

// `structuredClone(map)` throws (filters hold functions, overlays hold Sets), so the
// wrapper carries only what the rules read: dimensions, layers, settings, telegraphed
// spawns — plus the shape fields `MapObject` requires, empty. Filters are shared by
// reference (pure functions of the layers, never mutated).
const wrap = (source: MapObject, layers: MapLayers): MapObject =>
	({
		title: source.title,
		cols: source.cols,
		rows: source.rows,
		layers,
		filters: source.filters,
		funds: source.funds,
		fog: source.fog,
		scheduledSpawns: source.scheduledSpawns,
		route: [],
		highlights: [],
	}) as unknown as MapObject

/**
 * Run `fn` against `board` with the engine's stores shadowed by the board's copies.
 * Synchronous by construction: the shadow goes up, `fn` runs to completion, the
 * shadow comes down and the board keeps whatever the simulation left in it.
 *
 * Nesting is fine (a search node inside a live planning tick, a child node inside
 * its parent's expansion): each level restores the level above it.
 */
export const withSimulated = <T>(board: SimBoard, fn: (map: MapObject) => T): T => {
	const prevState = gameState.installShadow(board.state)
	const prevSmoke = smokeTiles.installShadow(board.smoke)
	try {
		return fn(board.map)
	} finally {
		board.smoke = smokeTiles.liftShadow(prevSmoke)
		board.state = gameState.liftShadow(prevState)
	}
}

/** Apply one action to a simulated board (inside `withSimulated`). */
export const applySimulated = (map: MapObject, action: SerializedAction): void => {
	applyAction(map, action, { simulated: true })
}

export type GreedyTurnHooks = {
	/**
	 * Called after each applied action with the unit layer as it was BEFORE the action
	 * (the sim harness diffs it to count losses). The copy is only taken when a hook is
	 * present, so the search pays nothing for it.
	 */
	onAction?: (action: SerializedAction, before: (UnitObject | null)[]) => void
	/** Safety valve on the tick loop; the default is far above any real turn. */
	maxTicks?: number
	/**
	 * The search branching on production: the FIRST factory build of the turn is this
	 * action instead of `pickBuildOnce`'s choice (later builds stay greedy). Ignored if
	 * it can no longer be placed by the time the units are done.
	 */
	buildOverride?: SerializedAction | null
}

/**
 * The depth-1 policy — exactly `runCpuTurn`'s tick loop with no animation, no relay
 * and no delay — played on whatever board the stores currently describe. Returns the
 * actions it took, in order. Does NOT end the turn: the caller decides whether the
 * hand-over is part of what it is simulating.
 *
 * Call it directly on a live headless board (the sim tests do) or through
 * {@link simulateGreedyTurn} on a snapshot.
 */
export const runGreedyTurn = (
	map: MapObject,
	team: number,
	hooks: GreedyTurnHooks = {}
): SerializedAction[] => {
	const log: SerializedAction[] = []
	const max = hooks.maxTicks ?? 400
	const apply = (action: SerializedAction) => {
		const before = hooks.onAction ? map.layers.units.slice() : null
		applyAction(map, action, { simulated: true })
		log.push(action)
		if (hooks.onAction && before) hooks.onAction(action, before)
	}
	let buildOverride = hooks.buildOverride ?? null
	for (let guard = 0; guard < max; guard++) {
		let best: { score: number; actions: SerializedAction[] } | null = null
		beginCpuPlanning(map)
		try {
			const acted = get(gameState).actedTiles
			for (const { tile, unit } of planningUnits(map)) {
				if (unit.team !== team || acted.has(tile)) continue
				const plan = bestPlanFor(map, tile, unit, team)
				if (plan && (!best || plan.score > best.score)) best = plan
			}
		} finally {
			endCpuPlanning()
		}
		const actions = best?.actions ?? []
		if (actions.length === 0) {
			if (buildOverride) {
				const forced = buildOverride
				buildOverride = null
				if (forced.kind === 'build' && map.layers.units[forced.building] == null) {
					apply(forced)
					// A build that could not be placed leaves the tile empty; fall through to
					// the greedy choice next tick rather than looping on it.
					if (map.layers.units[forced.building]) continue
				}
			}
			const build = pickBuildOnce(map, team)
			if (!build) return log
			apply(build)
			continue
		}
		for (const action of actions) apply(action)
	}
	return log
}

/** {@link runGreedyTurn} on a snapshot, leaving the live match untouched. */
export const simulateGreedyTurn = (
	board: SimBoard,
	team: number,
	hooks: GreedyTurnHooks = {}
): SerializedAction[] => withSimulated(board, (map) => runGreedyTurn(map, team, hooks))

/** A simulated end-turn on a snapshot: income, Start_Turn hazards and captures land. */
export const simulateEndTurn = (board: SimBoard): void => {
	withSimulated(board, (map) => applySimulated(map, { kind: 'end-turn' }))
}
