/**
 * spawnTelegraph — pure lookahead over a parsed campaign script.
 *
 * A scripted reinforcement is telegraphed one turn ahead so the owning player
 * (and the CPU, when it owns the spawn) can plan around it — without changing
 * how any script plays: the actual spawn still fires when its `<turn>` block
 * runs. This module just *reads* the script to answer "what will land on my
 * next turn, and where", producing {@link SpawnTelegraph} markers the renderer
 * and the AI consume off `map.scheduledSpawns`.
 *
 * It is side-effect-free (mirrors the runner's "headless" rule): given the
 * script, the turn order and the current position, it returns the spawns. A
 * `random unit` beat is resolved through `randomSpawn.ts`, whose roll is a pure
 * function of the match seed, so telegraphing one is as stable as reading an
 * authored spawn off the script.
 *
 * `<when>` conditional spawns are deliberately not telegraphed — they fire on a
 * game-state condition, not a fixed turn, so they can't be predicted.
 */

import { unitData } from '$lib/GameData/unit'
import type { CutsceneScript } from './cutsceneTypes'
import { asSpawn } from './randomSpawn'

/** The slice of a `Player` this lookahead needs: turn order + who's still in. */
export interface TelegraphPlayer {
	team: number
	hasLost?: boolean
}

const unitTypeByName = (name: string): number => unitData.findIndex((u) => u.name === name)

/**
 * The spawns that will fire at the start of each team's *next* turn, relative to
 * the current `(currentTeam, turnNumber)` position.
 *
 * Turns only ever move forward, so a block's "already fired" state is implied by
 * position: a team later in this round's order still acts this round; the active
 * team and any that already acted act next round. `turnNumber` is the engine's
 * 1-based counter, so the current round index is `turnNumber - 1` — matching how
 * the mount routes `enterTurn(round, team)`.
 */
export const upcomingSpawns = (
	script: CutsceneScript,
	players: readonly TelegraphPlayer[],
	currentTeam: number,
	turnNumber: number,
	cols: number
): SpawnTelegraph[] => {
	const order = players.filter((p) => !p.hasLost).map((p) => p.team)
	if (order.length === 0) return []

	const currentRound = turnNumber - 1
	const ci = order.indexOf(currentTeam)
	const telegraphs: SpawnTelegraph[] = []

	for (const team of order) {
		const ti = order.indexOf(team)
		// Later in this round's order → its turn is still coming this round; the
		// active team (ti === ci) and anyone who already acted → next round.
		const round = ci >= 0 && ti > ci ? currentRound : currentRound + 1
		const block = script.turns[round]?.[team]
		if (!block) continue
		for (const event of block) {
			// `randomSpawn` resolves off the match seed, not a draw counter, so the
			// answer here is the same one the runner will reach when the block fires.
			const spawn = asSpawn(event)
			if (!spawn) continue
			const unitType = unitTypeByName(spawn.unit)
			if (unitType < 0) continue
			telegraphs.push({
				tile: spawn.y * cols + spawn.x,
				team,
				unitType,
				unitName: spawn.unit,
			})
		}
	}

	return telegraphs
}
