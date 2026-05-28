import { get } from 'svelte/store'
import { gameState } from './gameState'
import { applyAction } from './applyAction'
import { emitOutgoingAction } from './outgoingActions'
import { animateRoute, animateAttack, animateExplosion } from './Animator/animator'
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
	const dispatch = async (action: SerializedAction): Promise<void> => {
		if (action.kind === 'move') {
			const unit = map.layers.units[action.from]
			if (!unit) return
			map.layers.units[action.from] = null
			await safeAnimate(() => animateRoute(map, unit, action.from, action.to))
			map.layers.units[action.from] = unit
			if (cancelled) return
			commit(map, action)
			return
		}

		if (action.kind === 'attack') {
			const attacker = map.layers.units[action.from]
			const target = map.layers.units[action.to]
			if (!attacker || !target) return
			await safeAnimate(() => animateAttack(map, attacker, action.from, action.to))
			if (cancelled) return
			const targetWasAlive = (target.health ?? 0) > 0
			commit(map, action)
			if (targetWasAlive && map.layers.units[action.to] == null) {
				await safeAnimate(() => animateExplosion(map, action.to))
			}
			if (map.layers.units[action.from] == null) {
				await safeAnimate(() => animateExplosion(map, action.from))
			}
			return
		}

		if (cancelled) return
		commit(map, action)
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
				await dispatch(action)
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
