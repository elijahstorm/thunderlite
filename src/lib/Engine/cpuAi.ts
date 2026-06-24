import { get } from 'svelte/store'
import { gameState } from './gameState'
import { applyAction } from './applyAction'
import { emitOutgoingAction } from './outgoingActions'
import { animateRoute } from './Animator/animator'
import { animateAttackSequence } from './attackSequence'
import { pathFinder } from './Interactor/Pathing/pathFinder'
import { truncateRouteAtCollision } from './Interactor/Pathing/movement'
import { concealedEnemyTiles } from './visibility'
import { observeStealthSightings } from './cpuAi/stealthMemory'
import { bestPlanFor } from './cpuAi/candidates'
import { pickBuildOnce } from './cpuAi/production'
import type { SerializedAction } from './Interactor/serializedAction'
import type { ActionPlan } from './cpuAi/types'

// Gap inserted *between* consecutive CPU actions. Each move/attack now plays its
// own animation (same helpers a human's actions use), so the bulk of the pacing
// comes from the animations themselves — this just keeps distinct actions from
// blurring together.
export const CPU_AI_TURN_DELAY_MS = 150

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

const commit = (map: MapObject, action: SerializedAction): void => {
	// The CPU turn is live, animated gameplay (one action at a time), so its
	// moves/attacks/deaths should sound just like a human's. Only the reconnect
	// replay path stays silent.
	applyAction(map, action, { live: true })
	emitOutgoingAction(action)
}

const findActableUnits = (
	map: MapObject,
	cpuTeam: number
): { tile: number; unit: UnitObject }[] => {
	const acted = get(gameState).actedTiles
	const out: { tile: number; unit: UnitObject }[] = []
	const units = map.layers.units
	for (let i = 0; i < units.length; i++) {
		const u = units[i]
		if (!u || u.team !== cpuTeam) continue
		if (acted.has(i)) continue
		out.push({ tile: i, unit: u })
	}
	return out
}

const pickBestPlan = (map: MapObject, cpuTeam: number): ActionPlan | null => {
	const units = findActableUnits(map, cpuTeam)
	let best: ActionPlan | null = null
	for (const { tile, unit } of units) {
		const plan = bestPlanFor(map, tile, unit, cpuTeam)
		if (!plan) continue
		if (!best || plan.score > best.score) best = plan
	}
	return best
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
	observeStealthSightings(map, startTeam)

	let cancelled = false
	let timer: ReturnType<typeof setTimeout> | null = null

	const stillOurTurn = (): boolean => {
		if (cancelled) return false
		const s = get(gameState)
		if (s.phase !== 'playing') return false
		if (s.currentTeam !== startTeam) return false
		if (s.turnNumber !== startTurn) return false
		if (s.currentTeam === humanTeam) return false
		return true
	}

	const schedule = (fn: () => void) => {
		timer = setTimeout(fn, delayMs)
	}

	const finish = () => {
		if (!stillOurTurn()) return
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
	// Returns whether the rest of the unit's plan should still run. A move that walks
	// into a concealed enemy returns false: the unit halts and forfeits any queued
	// follow-up (attack/capture), exactly like the human path.
	const dispatch = async (action: SerializedAction): Promise<boolean> => {
		if (action.kind === 'move') {
			const unit = map.layers.units[action.from]
			if (!unit) return false
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
				return false
			}
			map.layers.units[action.from] = null
			await safeAnimate(() => animateRoute(map, unit, action.from, finalTile, walked))
			map.layers.units[action.from] = unit
			if (cancelled) return false
			commit(map, { kind: 'move', from: action.from, to: finalTile })
			return !collided
		}

		if (action.kind === 'attack') {
			const attacker = map.layers.units[action.from]
			const target = map.layers.units[action.to]
			if (!attacker || !target) return true
			// Same choreography a human attack plays — swing, target bar/explosion,
			// counter, attacker bar/explosion — committing the result at the end.
			// `safeAnimate` still guards the visuals, but the commit lives inside the
			// sequencer; pass it through so a cancelled turn skips the commit too.
			if (cancelled) return false
			await safeAnimate(() =>
				animateAttackSequence(map, action.from, action.to, (a) => {
					if (!cancelled) commit(map, a)
				})
			)
			return true
		}

		if (cancelled) return false
		commit(map, action)
		return true
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
			const plan = pickBestPlan(map, startTeam)
			const actions = plan?.actions ?? []
			if (actions.length === 0) {
				const build = pickBuildOnce(map, startTeam)
				if (!build) {
					finish()
					return
				}
				await dispatch(build)
				if (!stillOurTurn()) return
				schedule(() => void tick())
				return
			}

			for (const action of actions) {
				if (!stillOurTurn()) return
				const proceed = await dispatch(action)
				// A blind move that collided ends this unit's plan; other units still act.
				if (!proceed) break
			}
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
