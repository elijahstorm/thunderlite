import { get } from 'svelte/store'
import { gameState } from './gameState'
import { applyAction } from './applyAction'
import { emitOutgoingAction } from './outgoingActions'
import { bestPlanFor } from './cpuAi/candidates'
import { pickBuildOnce } from './cpuAi/production'
import type { SerializedAction } from './Interactor/serializedAction'
import type { ActionPlan } from './cpuAi/types'

export const CPU_AI_TURN_DELAY_MS = 350

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
	let followUps: SerializedAction[] = []

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

	const tick = () => {
		if (!stillOurTurn()) return

		if (followUps.length > 0) {
			const next = followUps.shift() as SerializedAction
			commit(map, next)
			schedule(tick)
			return
		}

		const plan = pickBestPlan(map, startTeam)
		if (plan && plan.actions.length > 0) {
			const [first, ...rest] = plan.actions
			followUps = rest
			commit(map, first)
			schedule(tick)
			return
		}

		const build = pickBuildOnce(map, startTeam)
		if (build) {
			commit(map, build)
			schedule(tick)
			return
		}

		finish()
	}

	schedule(tick)

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
