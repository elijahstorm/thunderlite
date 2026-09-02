import { get, writable } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { gameState } from '../gameState'
import { boardDigest } from '../boardDigest'
import { canDeployFromFactory } from '../build'
import { SeedStream, matchRandom } from '../matchSeed'
import { generatePlansFor } from './candidates'
import { rankBuildableTypes } from './production'
import {
	beginCpuPlanning,
	endCpuPlanning,
	planningBuildings,
	planningConcealed,
	planningUnits,
} from './planningContext'
import { evaluatePosition } from './evaluatePosition'
import { incomingThreatMoveAware } from './evaluate'
import { cloneBoard, withSimulated, applySimulated, runGreedyTurn, type SimBoard } from './sim'
import { weights as W } from './weights'
import type { ActionPlan } from './types'
import type { SerializedAction } from '../Interactor/serializedAction'

/**
 * search — a time-boxed, iterative-deepening lookahead over WHOLE TURNS.
 *
 * The greedy policy (candidates.ts + the tick loop) is depth 1: it scores every
 * legal plan against the board as it stands and never asks "and then what does the
 * opponent do?". This asks. A node is the board after a whole team turn; depth counts
 * half-rounds (d1 = my turn, d2 = my turn then their best reply, d3 = plus my next
 * turn); the leaf value is `evaluatePosition`. Alpha-beta over the turn plans at
 * each node, a transposition table keyed by `boardDigest`, and iterative deepening
 * that only ever replaces the answer when a full iteration completes — so the clock
 * running out costs depth, never correctness.
 *
 * A tactics grid has a branching factor that dwarfs chess (a turn is N units × their
 * reachable tiles × actions, plus builds), so everything is deliberately lossy:
 *
 *  - TURN PLANS ARE OVERRIDES on the greedy policy, not full cross products. Plan 0
 *    is pure greedy (exactly what the CPU would play today). Every other plan says
 *    "unit X takes its 2nd/3rd-best option instead" for one or two units that are in
 *    CONTACT (near a visible enemy or an objective); everyone else still plays greedy
 *    around that choice. So the search corrects the ordering among good plans, not
 *    among bad ones, and units that are just travelling never branch.
 *  - Per unit only the top K plans are ever considered; at most B turn plans per node
 *    (B_opp, narrower, for the opponent, whose reply only has to punish, not to be
 *    optimal). Builds stay greedy below the root; the root also tries the second-best
 *    production choice.
 *  - Past the reply, only LOUD lines (an attack, a capture, a landing) are extended;
 *    quiet plans rarely need refutation, so the budget goes to the fights.
 *  - Root plans that the depth-1 pass rates far below greedy are not deepened.
 *
 * It never cheats fog: it is handed a `believedSnapshot` (concealed enemies absent,
 * the fog hunch present) and the opponent's reply is generated on that same board.
 * Nothing here draws from `cpuRandom`; the search's own sampling uses the
 * `SeedStream.CpuSearch` stream, so the planner's pinned draws are untouched and a
 * node-budget run is fully reproducible.
 *
 * `commit` is never reachable from here. The search only ever touches SimBoards; the
 * caller dispatches the chosen root plan through the ordinary funnel one action at a
 * time (see cpuAi.ts, policy 'search').
 */

export type SearchBudget = {
	/** Wall-clock budget. Live play. */
	ms?: number
	/** Node budget (simulated turns). Tests and reproducible runs. */
	nodes?: number
}

export type SearchConfig = {
	/** Deepest half-round to try. 1 = pick the best root plan by eval; 2 = plus the reply. */
	maxDepth: number
	/** Alternative plans kept per contact unit (the best is always one of them). */
	K: number
	/** Turn plans per node for the CPU. */
	B: number
	/** Turn plans per node for the opponent's reply. */
	Bopp: number
	/** Chebyshev distance from a visible enemy / objective inside which a unit branches. */
	contactRadius: number
	budget: SearchBudget
}

export const DEFAULT_SEARCH: SearchConfig = {
	maxDepth: 2,
	K: 3,
	B: 8,
	Bopp: 3,
	contactRadius: 6,
	budget: { nodes: 400 },
}

/**
 * One whole-turn plan: a few units forced onto a specific per-unit plan (applied
 * first, in tile order), an optional first factory build, and greedy for the rest.
 */
export type TurnPlan = {
	overrides: ActionPlan[]
	build: SerializedAction | null
	label: string
}

export type RootPlanReport = {
	label: string
	/** Value from the deepest completed iteration, or null if it was cut before one. */
	value: number | null
	depth: number
}

export type SearchTelemetry = {
	nodes: number
	depthCompleted: number
	ms: number
	rootPlans: number
	/** The value of plan 0 (pure greedy) at the deepest completed iteration. */
	greedyValue: number | null
	/** The chosen plan's value at that iteration. */
	chosenValue: number | null
	chosen: string
	plans: RootPlanReport[]
	/** True when the budget ran out (or a stop was requested) before maxDepth. */
	truncated: boolean
	/** True when the units on the board exceeded the lazy threshold and no search ran. */
	skipped: boolean
}

export type SearchResult = {
	plan: TurnPlan
	telemetry: SearchTelemetry
}

const GREEDY: TurnPlan = { overrides: [], build: null, label: 'greedy' }

/** The last live search's telemetry, for the dev pages. Null until a search has run. */
export const searchTelemetry = writable<SearchTelemetry | null>(null)

const now = (): number =>
	typeof performance !== 'undefined' && typeof performance.now === 'function'
		? performance.now()
		: Date.now()

class BudgetExceeded extends Error {}

// ── Contact ─────────────────────────────────────────────────────────────────────

const chebyshev = (cols: number, a: number, b: number): number =>
	Math.max(Math.abs((a % cols) - (b % cols)), Math.abs(Math.floor(a / cols) - Math.floor(b / cols)))

/**
 * Tiles worth branching near: every visible enemy unit and every enemy / neutral
 * objective. A unit farther than `radius` from all of them is travel, not tactics,
 * and is frozen to its greedy plan.
 */
const contactAnchors = (map: MapObject, team: number): number[] => {
	const concealed = planningConcealed(map, team)
	const anchors: number[] = []
	for (const { tile, unit } of planningUnits(map)) {
		if (unit.team !== team && !concealed.has(tile)) anchors.push(tile)
	}
	for (const { tile, building } of planningBuildings(map)) {
		if (building.team === team) continue
		if ((buildingData[building.type]?.stature ?? 0) <= 0) continue
		anchors.push(tile)
	}
	return anchors
}

// ── Turn-plan generation (the move generator) ───────────────────────────────────

type Swap = { plan: ActionPlan; gap: number }

/** `kind@from>standsOn[!target]`: where the unit ends up, and what it hit if it hit. */
const kindLabel = (plan: ActionPlan): string => {
	let standsOn = plan.unitTile
	let target: number | null = null
	for (const action of plan.actions) {
		if (action.kind === 'move') standsOn = action.to
		else if (action.kind === 'attack') target = action.to
		else if (action.kind === 'transport-unload') standsOn = action.tile
	}
	return `${plan.kind}@${plan.unitTile}>${standsOn}${target !== null ? `!${target}` : ''}`
}

/** Loud plans are the ones worth refuting: they change material or ownership. */
const isLoud = (plan: ActionPlan): boolean =>
	plan.kind === 'attack' ||
	plan.kind === 'capture' ||
	plan.kind === 'land' ||
	plan.kind === 'air-lift' ||
	plan.kind === 'ship-out'

/**
 * Up to `beam` turn plans for `team` on the board the stores currently describe.
 * Plan 0 is greedy. Then single swaps ordered by how little they cost the unit (a
 * near-tie is the most likely place the greedy ordering is wrong), then, if the beam
 * still has room, seeded pairs of swaps on distinct units.
 */
export const generateTurnPlans = (
	map: MapObject,
	team: number,
	beam: number,
	config: SearchConfig,
	seedKey: number[]
): TurnPlan[] => {
	beginCpuPlanning(map)
	try {
		const acted = get(gameState).actedTiles
		const anchors = contactAnchors(map, team)
		const swaps: Swap[] = []
		for (const { tile, unit } of planningUnits(map)) {
			if (unit.team !== team || acted.has(tile)) continue
			if (!anchors.some((a) => chebyshev(map.cols, a, tile) <= config.contactRadius)) continue
			const plans = generatePlansFor(map, tile, unit, team).sort((a, b) => b.score - a.score)
			const best = plans[0]
			if (!best) continue
			const seen = new Set<string>([JSON.stringify(best.actions)])
			let taken = 0
			for (const plan of plans) {
				if (taken >= config.K - 1) break
				const key = JSON.stringify(plan.actions)
				if (seen.has(key)) continue
				seen.add(key)
				swaps.push({ plan, gap: best.score - plan.score })
				taken++
			}
			// Kind diversity: when the top K are all attacks, no retreat is ever on the
			// table and the reply can't teach the search anything. The best plan of a
			// DIFFERENT kind than greedy's (a wait when greedy attacks, an attack when
			// greedy waits) always joins the beam, whatever it scored.
			const other = plans.find((p) => p.kind !== best.kind && !seen.has(JSON.stringify(p.actions)))
			if (other) {
				seen.add(JSON.stringify(other.actions))
				swaps.push({ plan: other, gap: best.score - other.score })
			}
			// The retreat: the wait on the tile with the least MOVE-AWARE incoming fire.
			// Every heuristic term pulls forward and the cheap threat term is stationary,
			// so the one plan the greedy ranking can never surface is "step back out of
			// their reach" — which is exactly the plan a reply can teach the search to
			// prefer. Ties (several equally safe tiles) go to the best-scoring one.
			const concealed = planningConcealed(map, team)
			let safest: ActionPlan | null = null
			let safestThreat = Infinity
			for (const plan of plans) {
				if (plan.kind !== 'wait') continue
				const last = plan.actions[plan.actions.length - 1]
				const dest = last && 'tile' in last ? last.tile : tile
				const threat = incomingThreatMoveAware(map, dest, unit, team, concealed)
				if (
					threat < safestThreat ||
					(threat === safestThreat && safest && plan.score > safest.score)
				) {
					safestThreat = threat
					safest = plan
				}
			}
			if (safest && !seen.has(JSON.stringify(safest.actions))) {
				seen.add(JSON.stringify(safest.actions))
				swaps.push({ plan: safest, gap: best.score - safest.score })
			}
		}
		swaps.sort((a, b) => a.gap - b.gap || a.plan.unitTile - b.plan.unitTile)

		const out: TurnPlan[] = [GREEDY]
		for (const swap of swaps) {
			if (out.length >= beam) break
			out.push({ overrides: [swap.plan], build: null, label: kindLabel(swap.plan) })
		}
		// Pairs: two different units off their greedy choice at once. Drawn on the
		// search's own seed stream so a node-budget run is reproducible and the
		// planner's pinned `cpuRandom` sequence is never touched.
		let attempt = 0
		while (out.length < beam && swaps.length >= 2 && attempt < beam * 2) {
			const i = Math.floor(matchRandom(SeedStream.CpuSearch, ...seedKey, attempt, 0) * swaps.length)
			const j = Math.floor(matchRandom(SeedStream.CpuSearch, ...seedKey, attempt, 1) * swaps.length)
			attempt++
			const a = swaps[i]
			const b = swaps[j]
			if (!a || !b || a.plan.unitTile === b.plan.unitTile) continue
			const overrides = [a.plan, b.plan].sort((x, y) => x.unitTile - y.unitTile)
			const label = overrides.map(kindLabel).join('+')
			if (out.some((p) => p.label === label)) continue
			out.push({ overrides, build: null, label })
		}
		return out
	} finally {
		endCpuPlanning()
	}
}

/**
 * The second-best production choice at the root, if there is one: the single place
 * the tree branches on builds (below the root, `pickBuildOnce` stays greedy).
 */
const alternativeBuild = (map: MapObject, team: number): SerializedAction | null => {
	const state = get(gameState)
	const player = state.players.find((p) => p.team === team)
	if (!player || player.money <= 0) return null
	const producers: number[] = []
	for (let i = 0; i < map.layers.buildings.length; i++) {
		const b = map.layers.buildings[i]
		if (!b || b.team !== team || !buildingData[b.type]?.actable) continue
		if (state.actedTiles.has(i) || map.layers.units[i] != null) continue
		producers.push(i)
	}
	if (producers.length === 0) return null
	const deployable: { type: number; producer: number }[] = []
	for (const { type } of rankBuildableTypes(map, team)) {
		const producer = producers.find((p) => canDeployFromFactory(map, p, type))
		if (producer !== undefined) deployable.push({ type, producer })
		if (deployable.length >= 2) break
	}
	const second = deployable[1]
	return second ? { kind: 'build', building: second.producer, unitType: second.type } : null
}

// ── Applying a turn plan to a node ──────────────────────────────────────────────

/**
 * Whether a per-unit plan can still be applied verbatim to this board (the unit is
 * where the plan left it, unacted; its destination is free; its target is alive).
 * Read live by `runCpuTurn` before dispatching a searched override, and by the
 * search when stacking two overrides in one turn plan.
 */
export const planStillValid = (map: MapObject, plan: ActionPlan, team: number): boolean => {
	const acted = get(gameState).actedTiles
	const mover = map.layers.units[plan.unitTile]
	if (!mover || mover.team !== team || acted.has(plan.unitTile)) return false
	for (const action of plan.actions) {
		switch (action.kind) {
			case 'move':
				if (action.from !== action.to && map.layers.units[action.to]) return false
				break
			case 'attack': {
				const target = map.layers.units[action.to]
				if (!target || target.team === team) return false
				break
			}
			case 'transport-load':
				if (!map.layers.units[action.transport]) return false
				break
			default:
				break
		}
	}
	return true
}

/**
 * Play `plan` for `team` on whatever board the stores currently describe, WITHOUT
 * ending the turn: the overrides first (skipping any the board no longer allows),
 * then greedy for everyone else. Returns whether the turn was loud (any override or
 * greedy action that attacked, captured or landed). Headless only — the live CPU
 * turn dispatches the same plan one action at a time through `runCpuTurn`.
 */
export const applyTurnPlan = (map: MapObject, team: number, plan: TurnPlan): boolean => {
	let loud = false
	for (const override of plan.overrides) {
		if (!planStillValid(map, override, team)) continue
		for (const action of override.actions) applySimulated(map, action)
		if (isLoud(override)) loud = true
	}
	const log = runGreedyTurn(map, team, { buildOverride: plan.build })
	if (log.some((a) => a.kind === 'attack' || a.kind === 'transport-unload')) loud = true
	return loud
}

/** {@link applyTurnPlan} on a node, then end the turn so the reply can be generated. */
export const playTurnPlan = (board: SimBoard, team: number, plan: TurnPlan): boolean =>
	withSimulated(board, (map) => {
		const loud = applyTurnPlan(map, team, plan)
		applySimulated(map, { kind: 'end-turn' })
		return loud
	})

// ── The search ───────────────────────────────────────────────────────────────────

type Ctx = {
	cpuTeam: number
	config: SearchConfig
	nodes: number
	startedAt: number
	turn: number
	tt: Map<string, { depth: number; value: number }>
	stop?: () => boolean
}

const checkBudget = (ctx: Ctx): void => {
	const { budget } = ctx.config
	if (budget.nodes !== undefined && ctx.nodes >= budget.nodes) throw new BudgetExceeded()
	if (budget.ms !== undefined && now() - ctx.startedAt >= budget.ms) throw new BudgetExceeded()
	if (ctx.stop?.()) throw new BudgetExceeded()
}

const evaluate = (board: SimBoard, ctx: Ctx): number =>
	withSimulated(board, (map) => evaluatePosition(map, ctx.cpuTeam))

const digestOf = (board: SimBoard): string => withSimulated(board, (map) => boardDigest(map))

/**
 * Alpha-beta over turn plans. `ply` is the half-round index from the root (the root
 * plans are ply 0, their children are evaluated here at ply 1). Yields once per
 * expanded node so a driver can check the clock and let the UI paint.
 */
function* value(
	board: SimBoard,
	ply: number,
	depthLeft: number,
	alpha: number,
	beta: number,
	loud: boolean,
	ctx: Ctx
): Generator<void, number, void> {
	if (depthLeft <= 0 || board.state.phase !== 'playing') return evaluate(board, ctx)
	const team = board.state.currentTeam
	const maximizing = team === ctx.cpuTeam
	// Extend only loud lines past the reply: a quiet CPU follow-up is not worth a ply.
	if (ply >= 2 && maximizing && !loud) return evaluate(board, ctx)

	const digest = digestOf(board)
	const hit = ctx.tt.get(digest)
	if (hit && hit.depth >= depthLeft) return hit.value

	const beam = maximizing ? ctx.config.B : ctx.config.Bopp
	const plans = withSimulated(board, (map) =>
		generateTurnPlans(map, team, beam, ctx.config, [ctx.turn, team, ply])
	)

	let best = maximizing ? -Infinity : Infinity
	for (const plan of plans) {
		const child = cloneBoard(board)
		const childLoud = playTurnPlan(child, team, plan)
		ctx.nodes++
		checkBudget(ctx)
		yield
		const v = yield* value(child, ply + 1, depthLeft - 1, alpha, beta, childLoud, ctx)
		if (maximizing) {
			if (v > best) best = v
			if (best > alpha) alpha = best
		} else {
			if (v < best) best = v
			if (best < beta) beta = best
		}
		if (alpha >= beta) break
	}
	ctx.tt.set(digest, { depth: depthLeft, value: best })
	return best
}

type RootChild = {
	plan: TurnPlan
	board: SimBoard
	loud: boolean
	value: number | null
	depth: number
	cut: boolean
}

/**
 * The search as a generator: drive it with {@link searchTurnSync} (drain it) or
 * {@link searchTurnAsync} (drain in slices, yielding to the event loop between them).
 * Each `yield` happens OUTSIDE any simulation shadow, so a driver may await there.
 *
 * `board` should be a `believedSnapshot` for `cpuTeam` whose state says it is that
 * team's turn. It is never mutated (children are clones).
 */
export function* searchGenerator(
	board: SimBoard,
	cpuTeam: number,
	config: SearchConfig = DEFAULT_SEARCH,
	stop?: () => boolean
): Generator<void, SearchResult, void> {
	const ctx: Ctx = {
		cpuTeam,
		config,
		nodes: 0,
		startedAt: now(),
		turn: board.state.turnNumber,
		tt: new Map(),
		stop,
	}
	const telemetry: SearchTelemetry = {
		nodes: 0,
		depthCompleted: 0,
		ms: 0,
		rootPlans: 0,
		greedyValue: null,
		chosenValue: null,
		chosen: GREEDY.label,
		plans: [],
		truncated: false,
		skipped: false,
	}
	const finish = (plan: TurnPlan): SearchResult => {
		telemetry.nodes = ctx.nodes
		telemetry.ms = now() - ctx.startedAt
		telemetry.chosen = plan.label
		return { plan, telemetry }
	}

	// Too many units: greedy plus the plan cache is the right tool, not a tree.
	const actable = board.map.layers.units.filter(
		(u, tile) => u && u.team === cpuTeam && !board.state.actedTiles.has(tile)
	).length
	if (actable >= W.LAZY_PLAN_THRESHOLD || config.maxDepth < 1) {
		telemetry.skipped = true
		return finish(GREEDY)
	}

	// Root plans: the beam, plus the second-best build riding on the greedy plan.
	const rootPlans = withSimulated(board, (map) => {
		const plans = generateTurnPlans(map, cpuTeam, config.B, config, [ctx.turn, cpuTeam, 0])
		const build = alternativeBuild(map, cpuTeam)
		if (build && build.kind === 'build') {
			plans.push({
				overrides: [],
				build,
				label: `build#2:${unitData[build.unitType]?.name ?? '?'}`,
			})
		}
		return plans
	})
	telemetry.rootPlans = rootPlans.length

	let best: TurnPlan = GREEDY
	const children: RootChild[] = []
	try {
		// Expand the root once; every iteration re-searches below these children.
		for (const plan of rootPlans) {
			const child = cloneBoard(board)
			const loud = playTurnPlan(child, cpuTeam, plan)
			ctx.nodes++
			checkBudget(ctx)
			children.push({ plan, board: child, loud, value: null, depth: 0, cut: false })
			yield
		}

		for (let depth = 1; depth <= config.maxDepth; depth++) {
			// Move ordering from the previous iteration; greedy (plan 0) first on a tie.
			const order = [...children].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
			let alpha = -Infinity
			const values = new Map<RootChild, number>()
			for (const child of order) {
				if (child.cut) continue
				const v = yield* value(child.board, 1, depth - 1, alpha, Infinity, child.loud, ctx)
				values.set(child, v)
				if (v > alpha) alpha = v
			}
			// A full iteration: adopt its answer.
			for (const child of children) {
				const v = values.get(child)
				if (v !== undefined) {
					child.value = v
					child.depth = depth
				}
			}
			const greedyValue = children[0].value ?? -Infinity
			let top = children[0]
			for (const child of children) {
				if (child.cut || child.value === null) continue
				if (child.value > (top.value ?? -Infinity)) top = child
			}
			best = top.plan
			telemetry.depthCompleted = depth
			telemetry.greedyValue = greedyValue
			telemetry.chosenValue = top.value
			// Margin cut: plans far below greedy are not worth deepening.
			for (const child of children) {
				if (child.value !== null && child.value < greedyValue - W.SEARCH_MARGIN) child.cut = true
			}
		}
	} catch (error) {
		if (!(error instanceof BudgetExceeded)) throw error
		telemetry.truncated = true
	}

	telemetry.plans = children.map((c) => ({ label: c.plan.label, value: c.value, depth: c.depth }))
	return finish(best)
}

/** Drain the generator on the calling thread (tests, batch runs, hidden tabs). */
export const searchTurnSync = (
	board: SimBoard,
	cpuTeam: number,
	config: SearchConfig = DEFAULT_SEARCH
): SearchResult => {
	const gen = searchGenerator(board, cpuTeam, config)
	for (;;) {
		const step = gen.next()
		if (step.done) return step.value
	}
}

/**
 * Let the event loop breathe: a macrotask hop (a `MessageChannel` message, which is
 * not throttled like timers, else `setTimeout(0)`), so the turn banner and the board
 * keep painting while the CPU thinks.
 */
const breathe = (): Promise<void> =>
	new Promise((resolve) => {
		if (typeof MessageChannel !== 'undefined') {
			const channel = new MessageChannel()
			channel.port1.onmessage = () => {
				channel.port1.close()
				resolve()
			}
			channel.port2.postMessage(null)
		} else {
			setTimeout(resolve, 0)
		}
	})

export type AsyncSearchOptions = {
	/** Return early (with the best complete iteration) when this says so. */
	stop?: () => boolean
	/** How long to run between yields to the event loop, in ms. */
	sliceMs?: number
	/** Never yield (a hidden tab, where timers are throttled and nobody is watching). */
	noYield?: boolean
}

/** Drain the generator in ~16 ms slices, yielding to the event loop between them. */
export const searchTurnAsync = async (
	board: SimBoard,
	cpuTeam: number,
	config: SearchConfig = DEFAULT_SEARCH,
	options: AsyncSearchOptions = {}
): Promise<SearchResult> => {
	const gen = searchGenerator(board, cpuTeam, config, options.stop)
	const slice = options.sliceMs ?? 16
	let sliceStart = now()
	for (;;) {
		const step = gen.next()
		if (step.done) return step.value
		if (!options.noYield && now() - sliceStart >= slice) {
			await breathe()
			sliceStart = now()
		}
	}
}
