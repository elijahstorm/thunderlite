import { get } from 'svelte/store'
import { gameState } from './gameState'
import { applyAction, type CommitOptions } from './applyAction'
import { emitOutgoingAction } from './outgoingActions'
import { isSyncLocked } from './desync'
import { animateRoute } from './Animator/animator'
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
import { isWalletUnit } from './wallet'
import type { SerializedAction } from './Interactor/serializedAction'
import type { ActionPlan } from './cpuAi/types'

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
const LAZY_PLAN_THRESHOLD = 70

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

export type CpuAiOptions = {
	humanTeam: number
	endTurn: () => void
	map: MapObject
	delayMs?: number
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

const pickBestPlan = (map: MapObject, cpuTeam: number, cache: PlanCache): ActionPlan | null => {
	// Open a planning window: the board is frozen for the duration of this call, so
	// the scorer's repeated reads (unit/building lists, enemy reach, concealment)
	// are computed once and memoised, then torn down so the next tick starts clean.
	beginCpuPlanning(map)
	try {
		const units = findActableUnits(map, cpuTeam)
		// Only trust cached plans once the army is large enough for the N² recompute to
		// bite. Below that we recompute every unit fresh, so behaviour is unchanged.
		const lazy = units.length >= LAZY_PLAN_THRESHOLD
		let best: ActionPlan | null = null
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
			if (!best || plan.score > best.score) best = plan
		}
		return best
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
	const hidden = (): boolean => typeof document !== 'undefined' && document.hidden

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
			const { route: walked, collided } = truncateRouteAtCollision(map, planned, unit.team)
			const finalTile =
				walked.length > 1 ? walked[walked.length - 1] : collided ? action.from : action.to
			if (collided && finalTile === action.from) {
				// Ambushed before taking a step: forfeit the move in place.
				commit(map, { kind: 'wait', tile: action.from })
				return { proceed: false, changed: [action.from] }
			}
			if (hidden()) {
				// No slide to roll the footsteps under, so let the commit voice the move.
				recordStealthPassthrough(map, walked, unit)
				commit(map, { kind: 'move', from: action.from, to: finalTile })
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
			commit(
				map,
				{ kind: 'move', from: action.from, to: finalTile },
				{ suppressSfxActions: ['move'] }
			)
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
			const plan = pickBestPlan(map, startTeam, planCache)
			const actions = plan?.actions ?? []
			if (actions.length === 0) {
				const build = pickBuildOnce(map, startTeam)
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
				if (!result.proceed) break
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
