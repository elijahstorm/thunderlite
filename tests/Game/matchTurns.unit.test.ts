// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { handoversFromLog, roundsFromHandovers, roundsFromLog } from '../../src/lib/Game/matchTurns'
import type { SerializedAction } from '../../src/lib/Engine/Interactor/serializedAction'
import { nextActiveTeam } from '../../src/lib/Engine/turnLoop'
import type { Player } from '../../src/lib/Engine/gameState'

const end = (team: number, next: number) => ({
	action: { kind: 'end-turn', next } as SerializedAction,
	team,
})
const noise = (team: number): { action: SerializedAction; team: number } => ({
	action: { kind: 'wait', tile: 0 },
	team,
})

/** What the engine itself would count for the same run of handovers. */
const engineRounds = (teams: number[], live: number[], handovers: number): number => {
	const players = teams.map((team) => ({
		team,
		money: 0,
		hasLost: !live.includes(team),
		hasFielded: true,
		controls: { ground: 0, air: 0, sea: 0 },
	})) as Player[]
	let current = live[0]
	let rounds = 1
	for (let i = 0; i < handovers; i++) {
		const advance = nextActiveTeam(players, current)
		if (!advance) break
		current = advance.team
		if (advance.wrapped) rounds++
	}
	return rounds
}

describe('roundsFromLog', () => {
	it('counts a round each time the handover wraps back down the team order', () => {
		// Four sides, all live: one round per full 0→1→2→3→0 lap.
		const log = [
			end(0, 1),
			noise(1),
			end(1, 2),
			end(2, 3),
			end(3, 0), // wrap
			end(0, 1),
			end(1, 2),
			end(2, 3),
			end(3, 0), // wrap
		]
		expect(roundsFromLog(log)).toBe(3)
	})

	it('ignores everything that is not an end-turn', () => {
		expect(roundsFromLog([noise(0), noise(1), noise(0)])).toBe(1)
	})

	it('agrees with the engine when the surviving sides are not adjacent', () => {
		// This is match 19's shape: teams 0 and 2 resigned, 1 and 3 played on. The
		// log alternates 1→3→1→3, and only the 3→1 hop wraps.
		const handovers = 46
		const log: { action: SerializedAction; team: number }[] = []
		let team = 1
		for (let i = 0; i < handovers; i++) {
			const next = team === 1 ? 3 : 1
			log.push(end(team, next))
			team = next
		}
		expect(roundsFromLog(log)).toBe(24)
		expect(roundsFromLog(log)).toBe(engineRounds([0, 1, 2, 3], [1, 3], handovers))
		// And the same count whether the dead sides are in the roster or not, which
		// is why "the client re-derived a two-entry players array" cannot on its own
		// explain a row claiming 46 rounds for this log.
		expect(engineRounds([1, 3], [1, 3], handovers)).toBe(24)
	})

	it('fills a missing `next` from the following handover', () => {
		// Events written before `end-turn.next` existed say who ended, not who came
		// after — the next end-turn's actor is that answer.
		const log = [
			{ action: { kind: 'end-turn' } as SerializedAction, team: 0 },
			{ action: { kind: 'end-turn' } as SerializedAction, team: 1 },
			{ action: { kind: 'end-turn' } as SerializedAction, team: 0 },
			{ action: { kind: 'end-turn' } as SerializedAction, team: 1 },
		]
		// 0→1, 1→0 (wrap), 0→1, 1→? (unknown, skipped)
		expect(roundsFromLog(log)).toBe(2)
	})

	it('skips a handover it cannot attribute rather than guessing a round', () => {
		expect(
			roundsFromHandovers([
				{ from: null, to: 0 },
				{ from: 1, to: null },
			])
		).toBe(1)
	})

	it('reads the team off the actor and the destination off the action', () => {
		expect(handoversFromLog([end(3, 1), noise(1), end(1, 3)])).toEqual([
			{ from: 3, to: 1 },
			{ from: 1, to: 3 },
		])
	})
})
