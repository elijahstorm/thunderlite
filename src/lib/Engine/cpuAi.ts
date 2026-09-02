import { get } from 'svelte/store'
import { gameState } from './gameState'
import { applyAction, type CommitOptions } from './applyAction'
import { emitOutgoingAction } from './outgoingActions'
import { isSyncLocked } from './desync'
import { animateRoute, animateBlocked } from './Animator/animator'
import { animateAttackSequence } from './attackSequence'
import { playActionSfx } from '$lib/Audio/playActionSfx'
import { pathFinder } from './Interactor/Pathing/pathFinder'
import { truncateRouteAtCollision } from './Interactor/Pathing/movement'
import { concealedEnemyTiles } from './visibility'
import {
	observeStealthSightings,
	recordStealthPassthrough,
	decayStealthSuspicion,
	clearSearchedSuspicion,
} from './cpuAi/stealthMemory'
import { updateFogBelief } from './cpuAi/fogMemory'
import { bestPlanFor } from './cpuAi/candidates'
import { beginCpuPlanning, endCpuPlanning, planningUnits } from './cpuAi/planningContext'
import { pickBuildOnce } from './cpuAi/production'
import { sampleByScore } from './cpuAi/rng'
import { isWalletUnit } from './wallet'
import type { SerializedAction } from './Interactor/serializedAction'
import type { ActionPlan } from './cpuAi/types'
import { weights as W } from './cpuAi/weights'
import { believedSnapshot } from './cpuAi/sim'
import {
	DEFAULT_SEARCH,
	planStillValid,
	searchTelemetry,
	searchTurnAsync,
	type SearchConfig,
	type SearchTelemetry,
} from './cpuAi/search'
import { canDeployFromFactory, discountedUnitCost } from './build'
import { unitData } from '$lib/GameData/unit'

// Gap inserted *between* consecutive CPU actions. Each move/attack now plays its
// own animation (same helpers a human's actions use), so the bulk of the pacing
// comes from the animations themselves — this just keeps distinct actions from
// blurring together.
export const CPU_AI_TURN_DELAY_MS = 150

// The planner is greedy best-first: each tick it re-plans every still-actable unit
// just to pick the single highest-scoring action, dispatches that one unit, and
// repeats. That's ~N²/2 full unit plannings per turn (N + (N-1) + … + 1), and each
// planning is a move-BFS plus per-reachable-tile attack/threat scans — the CPU stall
// you feel once armies get big.
//
// But committing one action only changes the board *near* the tiles it touched, so
// only units whose reach/threat footprint overlaps those tiles can have a different
// best plan next tick. Above this many actable units we cache each unit's best plan
// across ticks and recompute only the ones a committed action could have affected
// (see `invalidatePlans`), collapsing the turn back to ~O(N). Below the threshold the
// planner recomputes everything every tick exactly as before — the caching bookkeeping
// isn't worth it, and small games stay byte-for-byte identical.

/**
 * How close another unit's plan has to be to the best available one for the CPU to
 * consider acting with that unit instead. Same units as a plan score. Wider than the
 * per-unit temperature because the choice is only about ORDER — every unit still gets
 * its turn, so a slightly-lower-scoring unit going first costs almost nothing while
 * changing the board that everyone after it plans against.
 */

// Chebyshev radius within which a just-committed action can alter another unit's best
// plan. A unit's plan depends on its own reachable tiles (≤ max move = 9) and, over
// those tiles, enemy attack options and threat coverage — an enemy can reach one of
// those tiles from up to (max move 9 + max attack range 6) away. So a change at tile X
// only matters to unit U when X is within 9 + 9 + 6 = 24 of U. A generous superset for
// the ordinary case; a longer-range interaction (e.g. fog/vision shifting a distant
// unit's knowledge) is possible but rare, an accepted approximation on huge boards.
const PLAN_INVALIDATION_RADIUS = 24

// Per-unit best plan, keyed by the unit's current tile, persisted across the ticks of a
// single CPU turn. Unacted units never move between ticks (only the one chosen unit acts,
// and it's then flagged in `actedTiles` and skipped), so a unit's tile is a stable key
// and a cached plan stays valid until `invalidatePlans` clears it.
type PlanCache = Map<number, ActionPlan | null>

export type CpuAiHandle = {
	cancel: () => void
}

/**
 * How the CPU decides its turn. `greedy` is the depth-1 planner (the default, and
 * always the floor); `search` runs the time-boxed lookahead first (cpuAi/search.ts)
 * and dispatches its chosen root plan, then plays greedy for whatever it left open.
 */
export type CpuPolicy = 'greedy' | 'search'

export type CpuAiOptions = {
	humanTeam: number
	endTurn: () => void
	map: MapObject
	delayMs?: number
	policy?: CpuPolicy
	/** Search settings (depth, beams, budget). Merged over `DEFAULT_SEARCH`. */
	search?: Partial<SearchConfig>
	/** Fires with every search's telemetry (the dev playtest readout). */
	onSearch?: (telemetry: SearchTelemetry) => void
	/**
	 * Skip every animation and pacing delay, exactly as a hidden tab does, so a whole
	 * match plays out in seconds (the dev playtest's speed toggle). The search then
	 * runs on a node budget without yielding.
	 */
	fast?: boolean
}

/** Default wall-clock thinking time per CPU turn when the policy is `search`. */
export const LIVE_SEARCH_BUDGET_MS = 1500
/** Never let one turn's search approach the 45 s online stall watchdog. */
export const MAX_SEARCH_BUDGET_MS = 10_000
/** A hidden tab gets a tiny, timer-free node budget instead of a clock. */
export const HIDDEN_SEARCH_NODES = 200
/** Re-search after a diverged dispatch only while this share of the budget remains. */
export const RESEARCH_MIN_FRACTION = 0.3

/**
 * The time a live search may take: the requested budget, scaled down as the army
 * grows (a big board already strains depth 1; past the lazy threshold the search is
 * skipped outright) and hard-capped well under the stall watchdog.
 */
export const liveSearchBudget = (requestedMs: number, actableUnits: number): number => {
	const scale = Math.max(0.3, 1 - actableUnits / W.LAZY_PLAN_THRESHOLD)
	return Math.min(MAX_SEARCH_BUDGET_MS, Math.max(0, requestedMs * scale))
}

export const isCpuTurn = (humanTeam: number): boolean => {
	const state = get(gameState)
	if (state.phase !== 'playing') return false
	return state.currentTeam !== humanTeam
}

const commit = (map: MapObject, action: SerializedAction, opts?: CommitOptions): void => {
	// A driven CPU seat rides this client's relay stream, so a client frozen by a
	// detected desync must stop relaying for the AI too — otherwise the one board
	// we know is wrong keeps writing the room's history. Never set outside online
	// play, so local/campaign CPU turns are untouched. See `desync.ts`.
	if (isSyncLocked()) return
	// The CPU turn is live, animated gameplay (one action at a time), so its
	// moves/attacks/deaths should sound just like a human's. Only the reconnect
	// replay path stays silent. Animated actions (move / attack) voice their
	// sound at the animation beat and pass `suppressSfxActions` so the commit
	// doesn't play it a second time.
	applyAction(map, action, { live: true, ...opts })
	emitOutgoingAction(action)
}

// Tiles a committed action altered, for plan-cache invalidation. Move/attack report
// their real endpoints from `dispatch` (a move can be truncated); this covers the
// self-actions, where the effect sits on a single tile (`build-adjacent` spawns onto a
// neighbour of the builder, comfortably inside the invalidation radius).
const actionTiles = (action: SerializedAction): number[] => {
	switch (action.kind) {
		case 'move':
		case 'attack':
			return [action.from, action.to]
		case 'build-adjacent':
			return [action.builder]
		case 'build':
			// Factory build: a fresh unit lands on the building tile.
			return [action.building]
		case 'capture':
		case 'wait':
		case 'mine':
		case 'repair':
		case 'ship-out':
		case 'air-lift':
			return [action.tile]
		case 'transport-load':
			return [action.transport, action.passenger]
		case 'transport-unload':
			return [action.transport, action.tile]
		default:
			return []
	}
}

const findActableUnits = (
	map: MapObject,
	cpuTeam: number
): { tile: number; unit: UnitObject }[] => {
	const acted = get(gameState).actedTiles
	// planningUnits is the compact, per-tick-cached unit list (see planningContext).
	// Must run inside an active planning window — pickBestPlan opens one first.
	return planningUnits(map).filter(({ tile, unit }) => unit.team === cpuTeam && !acted.has(tile))
}

const pickBestPlan = (
	map: MapObject,
	cpuTeam: number,
	cache: PlanCache,
	startTurn: number
): ActionPlan | null => {
	// Open a planning window: the board is frozen for the duration of this call, so
	// the scorer's repeated reads (unit/building lists, enemy reach, concealment)
	// are computed once and memoised, then torn down so the next tick starts clean.
	beginCpuPlanning(map)
	try {
		const units = findActableUnits(map, cpuTeam)
		// Only trust cached plans once the army is large enough for the N² recompute to
		// bite. Below that we recompute every unit fresh, so behaviour is unchanged.
		const lazy = units.length >= W.LAZY_PLAN_THRESHOLD
		const ready: ActionPlan[] = []
		for (const { tile, unit } of units) {
			// Wallet units (Warmachines) score against globals like total enemy count, so a
			// kill anywhere can shift their plan — cheaper to always recompute the handful of
			// them than to track that dependency. Every other unit's plan is purely local.
			const cacheable = !isWalletUnit(unit)
			let plan: ActionPlan | null
			if (lazy && cacheable && cache.has(tile)) {
				plan = cache.get(tile) ?? null
			} else {
				plan = bestPlanFor(map, tile, unit, cpuTeam)
				if (cacheable) cache.set(tile, plan)
			}
			if (!plan) continue
			ready.push(plan)
		}
		// Which unit acts this tick. Sampling here is the cheapest source of variety the
		// planner has: acting order changes which board the later units plan against, so
		// two runs of the same turn diverge without any single unit ever taking a worse
		// plan than the one it picked. Keyed by turn and the tick's remaining unit count
		// so successive ticks in the same turn draw independently.
		return sampleByScore(ready, W.UNIT_ORDER_TEMPERATURE, startTurn, cpuTeam, units.length)
	} finally {
		endCpuPlanning()
	}
}

// Drop the cached plans of every unit whose situation the just-committed action could
// have changed: any unit within `PLAN_INVALIDATION_RADIUS` (Chebyshev) of a touched
// tile. They'll be replanned on the next tick; everyone else keeps their still-correct
// cached plan. Deleting entries during Map iteration is safe (visited-once semantics).
const invalidatePlans = (cache: PlanCache, changed: readonly number[], map: MapObject): void => {
	if (cache.size === 0 || changed.length === 0) return
	const cols = map.cols
	const cx = changed.map((t) => t % cols)
	const cy = changed.map((t) => Math.floor(t / cols))
	for (const tile of [...cache.keys()]) {
		const x = tile % cols
		const y = Math.floor(tile / cols)
		for (let i = 0; i < cx.length; i++) {
			if (
				Math.abs(x - cx[i]) <= PLAN_INVALIDATION_RADIUS &&
				Math.abs(y - cy[i]) <= PLAN_INVALIDATION_RADIUS
			) {
				cache.delete(tile)
				break
			}
		}
	}
}

export const runCpuTurn = ({
	humanTeam,
	endTurn,
	map,
	delayMs = CPU_AI_TURN_DELAY_MS,
	policy = 'greedy',
	search = {},
	onSearch,
	fast = false,
}: CpuAiOptions): CpuAiHandle => {
	const startTurn = get(gameState).turnNumber
	const startTeam = get(gameState).currentTeam

	// Reconcile this CPU's fuzzy stealth memory against what it can plainly see as
	// the turn opens — it can't believe an enemy has fewer cloak units than are
	// currently revealed. Build/death sightings during play adjust it from there.
	// NB: the hunch is NOT decayed here — anything learned during the enemy's turn
	// (e.g. a stealth unit that broke cover to attack) must be at full strength while
	// the CPU plans this turn. Decay happens when the CPU *ends* its turn (see
	// `finish`), modelling the one move the enemy gets before the CPU acts again.
	observeStealthSightings(map, startTeam)
	// Rule out the patches of the hunch it has already swept (radar / point-blank) and
	// found empty, so its best guess moves on instead of camping a dead spot forever.
	clearSearchedSuspicion(map, startTeam)
	// Update its belief about fog-hidden contacts (enemies it lost into the fog, units
	// of its own destroyed into the dark) so it can be wary of those regions this turn.
	updateFogBelief(map, startTeam)

	let cancelled = false
	let timer: ReturnType<typeof setTimeout> | null = null

	// Best plan per still-actable unit, reused across this turn's ticks so we don't
	// re-plan every unit just to pick one. Entries are dropped as committed actions
	// invalidate them (see `invalidatePlans`); it only kicks in above LAZY_PLAN_THRESHOLD.
	const planCache: PlanCache = new Map()

	const stillOurTurn = (): boolean => {
		if (cancelled) return false
		const s = get(gameState)
		if (s.phase !== 'playing') return false
		if (s.currentTeam !== startTeam) return false
		if (s.turnNumber !== startTurn) return false
		if (s.currentTeam === humanTeam) return false
		return true
	}

	// Nobody is watching this client's board. Animations are then pure cost — and
	// worse, a hidden tab suspends requestAnimationFrame and clamps setTimeout to
	// once a second (once a *minute* after a few minutes hidden), so a CPU turn
	// paced by those timers crawls. That is only a cosmetic loss here, but in an
	// online room this client is relaying the AI's moves for everyone else: the
	// other players sit and wait on a tab they can't see. So when hidden the turn
	// skips the choreography and commits straight through.
	const hidden = (): boolean => fast || (typeof document !== 'undefined' && document.hidden)

	const schedule = (fn: () => void) => {
		if (hidden()) {
			// Microtasks are untouched by background throttling, so the turn resolves at
			// full speed. `cancel` still stops it — `tick` re-checks `stillOurTurn`,
			// which reads the same `cancelled` flag the cleared timer would have.
			timer = null
			queueMicrotask(fn)
			return
		}
		timer = setTimeout(fn, delayMs)
	}

	// ── The search policy ─────────────────────────────────────────────────────────
	// The lookahead runs once at the start of the turn (yielding to the event loop so
	// the banner and board keep painting) and hands back a root TurnPlan: a few
	// per-unit overrides to play first, an optional first build, greedy for the rest.
	// Each tick then dispatches ONE override through the same funnel a greedy plan
	// uses, so relay, collision truncation, sync-lock and animation are untouched. If
	// a dispatched action lands differently than the plan assumed (a route truncated by
	// a hidden unit, an override the board no longer allows) the rest of the plan is
	// dropped and the turn is re-searched with whatever budget remains — or finished
	// greedy when there is not enough left to be worth it.
	const searchConfig: SearchConfig = { ...DEFAULT_SEARCH, ...search }
	const requestedMs = search.budget?.ms ?? LIVE_SEARCH_BUDGET_MS
	let overrideQueue: ActionPlan[] = []
	let buildOverride: SerializedAction | null = null
	let searched = policy !== 'search'
	let budgetLeftMs = Infinity

	const countActable = (): number => {
		const acted = get(gameState).actedTiles
		let n = 0
		map.layers.units.forEach((u, tile) => {
			if (u && u.team === startTeam && !acted.has(tile)) n++
		})
		return n
	}

	const runSearch = async (): Promise<void> => {
		searched = true
		const actable = countActable()
		const isHidden = hidden()
		if (budgetLeftMs === Infinity) budgetLeftMs = liveSearchBudget(requestedMs, actable)
		// A hidden tab gets the tiny fixed node budget; the dev page's fast mode keeps
		// the configured node budget (or the search default) but never yields either.
		const config: SearchConfig = {
			...searchConfig,
			budget: isHidden
				? {
						nodes: fast
							? (search.budget?.nodes ?? DEFAULT_SEARCH.budget.nodes ?? HIDDEN_SEARCH_NODES)
							: Math.min(HIDDEN_SEARCH_NODES, search.budget?.nodes ?? HIDDEN_SEARCH_NODES),
					}
				: search.budget?.nodes !== undefined
					? { nodes: search.budget.nodes, ms: budgetLeftMs }
					: { ms: budgetLeftMs },
		}
		const startedAt = Date.now()
		// The search only ever touches its own snapshot; `commit` is unreachable from it.
		const board = believedSnapshot(map, startTeam)
		const result = await searchTurnAsync(board, startTeam, config, {
			stop: () => !stillOurTurn(),
			noYield: isHidden,
		})
		budgetLeftMs = Math.max(0, budgetLeftMs - (Date.now() - startedAt))
		if (!stillOurTurn()) return
		overrideQueue = result.plan.overrides.slice()
		buildOverride = result.plan.build
		searchTelemetry.set(result.telemetry)
		onSearch?.(result.telemetry)
	}

	// The plan assumed a board that has since changed: forget the rest of it, and think
	// again if there is still meaningful time to do so.
	const diverged = (): void => {
		overrideQueue = []
		buildOverride = null
		const initial = liveSearchBudget(requestedMs, countActable())
		if (policy === 'search' && !hidden() && budgetLeftMs >= RESEARCH_MIN_FRACTION * initial) {
			searched = false
		}
	}

	/** The next searched override the live board still allows, dropping stale ones. */
	const nextOverride = (): ActionPlan | null => {
		while (overrideQueue.length > 0) {
			const candidate = overrideQueue.shift() as ActionPlan
			if (planStillValid(map, candidate, startTeam)) return candidate
			diverged()
		}
		return null
	}

	/** The search's first build, if the factory, the money and the tile still allow it. */
	const takeBuildOverride = (): SerializedAction | null => {
		const forced = buildOverride
		buildOverride = null
		if (!forced || forced.kind !== 'build') return null
		const state = get(gameState)
		const building = map.layers.buildings[forced.building]
		const player = state.players.find((p) => p.team === startTeam)
		const data = unitData[forced.unitType]
		if (!building || building.team !== startTeam || !player || !data) return null
		if (state.actedTiles.has(forced.building) || map.layers.units[forced.building]) return null
		if (player.money < discountedUnitCost(player, data)) return null
		if (!canDeployFromFactory(map, forced.building, forced.unitType)) return null
		return forced
	}

	const finish = () => {
		if (!stillOurTurn()) return
		// Age the location hunch by one step as the CPU hands the turn over: by the time
		// it acts again the enemy will have had a move, so its certainty widens and fades
		// now — not at the start of its turn, which would stale fresh intel before use.
		decayStealthSuspicion(map, startTeam)
		endTurn()
	}

	// Animations are cosmetic. A failed one (e.g. a unit type whose attack sprite
	// never loaded) must never reject out of `dispatch` and strand the turn — the
	// commit that follows is what actually advances the game, so we always let it
	// run. Swallow any animation error and keep the pacing beat.
	const safeAnimate = async (run: () => Promise<void>): Promise<void> => {
		try {
			await run()
		} catch {
			/* visual-only; the action still commits below */
		}
	}

	// Play the same animation a human action would before committing the state
	// change, so a CPU move slides and a CPU attack swings + explodes instead of
	// teleporting. Animations resolve via their own timers; we await them so the
	// turn paces itself off the animation length.
	// Returns `proceed` (whether the rest of the unit's plan should still run — a move
	// that walks into a concealed enemy returns false: the unit halts and forfeits any
	// queued follow-up, exactly like the human path) plus `changed`, the tiles this
	// action actually altered, so the plan cache can invalidate only the units near them.
	const dispatch = async (
		action: SerializedAction
	): Promise<{ proceed: boolean; changed: number[] }> => {
		if (action.kind === 'move') {
			const unit = map.layers.units[action.from]
			if (!unit) return { proceed: false, changed: [] }
			// The CPU plays blind, so its planned route can run through an enemy it
			// couldn't perceive. Re-pathfind with the same concealment the planner used,
			// then stop on the last clear tile if it collides — and commit the truncated
			// destination so an online opponent stays in sync.
			const concealed = concealedEnemyTiles(map, unit.team)
			const planned = pathFinder(map, unit, action.from, action.to, concealed)
			const { route: walked, collided, blocked } = truncateRouteAtCollision(map, planned, unit.team)
			const finalTile =
				walked.length > 1 ? walked[walked.length - 1] : collided ? action.from : action.to
			if (collided && finalTile === action.from) {
				// Ambushed before taking a step: forfeit the move in place. The wait
				// carries the tile it ran into so every board plays the blocked lunge.
				const waitAction: SerializedAction = { kind: 'wait', tile: action.from }
				if (blocked !== undefined) waitAction.blocked = blocked
				commit(map, waitAction)
				if (blocked !== undefined && !hidden()) {
					await safeAnimate(() => animateBlocked(map, unit, action.from, blocked))
				}
				return { proceed: false, changed: [action.from] }
			}
			// Relay the walked route alongside the endpoints so every other client
			// animates the road this unit really took rather than re-deriving one of
			// its own (see the `path` field on the move action) — and, on a collision,
			// the tile it ran into, so they play the same blocked lunge.
			const moveAction: Extract<SerializedAction, { kind: 'move' }> = {
				kind: 'move',
				from: action.from,
				to: finalTile,
			}
			if (walked.length > 1) moveAction.path = walked.slice()
			if (blocked !== undefined) moveAction.blocked = blocked
			if (hidden()) {
				// No slide to roll the footsteps under, so let the commit voice the move.
				recordStealthPassthrough(map, walked, unit)
				commit(map, moveAction)
				return { proceed: !collided, changed: [action.from, finalTile] }
			}
			map.layers.units[action.from] = null
			// Footsteps roll *with* the walk, not after it. The commit below
			// suppresses 'move' so the sound isn't heard twice.
			playActionSfx('move', unit)
			await safeAnimate(() => animateRoute(map, unit, action.from, finalTile, walked))
			map.layers.units[action.from] = unit
			if (cancelled) return { proceed: false, changed: [] }
			// A cloaked unit caught crossing an enemy radar ring mid-route is logged so
			// the watching player "remembers" a stealth threat is about.
			recordStealthPassthrough(map, walked, unit)
			commit(map, moveAction, { suppressSfxActions: ['move'] })
			// Walked into a concealed enemy: bump the tile it hit so the watching
			// player reads the halt as an ambush rather than a unit that gave up.
			if (blocked !== undefined) {
				await safeAnimate(() => animateBlocked(map, unit, finalTile, blocked))
			}
			// The unit vacated `from` and now sits on `finalTile`; both flip the board for
			// nearby planners. Intermediate path tiles hold no unit, so they don't count.
			return { proceed: !collided, changed: [action.from, finalTile] }
		}

		if (action.kind === 'attack') {
			const attacker = map.layers.units[action.from]
			const target = map.layers.units[action.to]
			if (!attacker || !target) return { proceed: true, changed: [] }
			// Same choreography a human attack plays — swing, target bar/explosion,
			// counter, attacker bar/explosion — committing the result at the end.
			// `safeAnimate` still guards the visuals, but the commit lives inside the
			// sequencer; pass it through so a cancelled turn skips the commit too.
			if (cancelled) return { proceed: false, changed: [] }
			if (hidden()) {
				// The commit normally rides inside the sequencer; with no sequence to play,
				// `applyAction` resolves the whole exchange on its own (the same path a
				// reconnecting client replays combat through).
				commit(map, action)
				return { proceed: true, changed: [action.from, action.to] }
			}
			await safeAnimate(() =>
				animateAttackSequence(map, action.from, action.to, (a, opts) => {
					if (!cancelled) commit(map, a, opts)
				})
			)
			// Both combatants' HP (or deaths) changed here, reshaping threat around them.
			return { proceed: true, changed: [action.from, action.to] }
		}

		if (cancelled) return { proceed: false, changed: [] }
		commit(map, action)
		return { proceed: true, changed: actionTiles(action) }
	}

	// One tick = one unit's full plan (e.g. move → attack → explosion) dispatched
	// back-to-back with no gap, so a unit's own actions flow together like a
	// human's. The delayMs pause only sits *between* units / build orders.
	const tick = async () => {
		if (!stillOurTurn()) return

		// Any unexpected failure (planner, commit, scheduling) must end the turn
		// rather than freeze the match on the CPU's side — `finish` hands control
		// back to the player. Without this net a single throw leaves the turn
		// hung, since nothing else schedules the next tick.
		try {
			if (!searched) {
				await runSearch()
				if (!stillOurTurn()) return
			}
			// A searched override goes first; once the queue is empty (or was never
			// filled) every remaining unit is planned greedily, exactly as before.
			const override = nextOverride()
			const plan = override ?? pickBestPlan(map, startTeam, planCache, startTurn)
			const actions = plan?.actions ?? []
			if (actions.length === 0) {
				const build = takeBuildOverride() ?? pickBuildOnce(map, startTeam)
				if (!build) {
					finish()
					return
				}
				const { changed } = await dispatch(build)
				invalidatePlans(planCache, changed, map)
				if (!stillOurTurn()) return
				schedule(() => void tick())
				return
			}

			// A unit's plan can be several actions (move → attack); collect every tile they
			// touch, then invalidate once so nearby units replan against the settled board.
			const changed: number[] = []
			for (const action of actions) {
				if (!stillOurTurn()) return
				const result = await dispatch(action)
				changed.push(...result.changed)
				// A blind move that collided ends this unit's plan; other units still act.
				if (!result.proceed) {
					// The board no longer matches what the search assumed.
					if (override) diverged()
					break
				}
			}
			invalidatePlans(planCache, changed, map)
			if (!stillOurTurn()) return
			schedule(() => void tick())
		} catch {
			finish()
		}
	}

	schedule(() => void tick())

	return {
		cancel: () => {
			cancelled = true
			if (timer !== null) {
				clearTimeout(timer)
				timer = null
			}
		},
	}
}
