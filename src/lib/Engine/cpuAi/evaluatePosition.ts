import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { gameState, type GameState } from '../gameState'
import { evaluateWinConditions } from '../winConditions'
import { walletOf } from '../wallet'
import {
	beginCpuPlanning,
	endCpuPlanning,
	planningConcealed,
	planningUnits,
} from './planningContext'
import { scorePositionBonus } from './score'
import { lurkingStealthCount } from './stealthMemory'
import { buildingIncome } from './growth'
import { weights as W } from './weights'

/**
 * evaluatePosition — the number the search maximises.
 *
 * The material core is exactly what the player already sees on the results chart
 * and the replay strength bar (`matchTimeline.sampleTeams`: army = unit cost × hp%,
 * plus funds), so an AI optimising it is legible: the CPU plays to move that bar.
 * Two things make it a legal and useful evaluator:
 *
 *  1. It is BELIEVED, not true. Enemy units the CPU cannot perceive (fog, stealth)
 *     are absent, exactly as they are absent from every other CPU scorer, and the
 *     fog hunch (`Player.fogBelief` heat) is charged as a discounted expected enemy
 *     value so a blank fog region is not read as "no enemy". The CPU's own side is
 *     always fully known.
 *  2. Material alone is flat inside a turn (moving a unit changes nothing), so the
 *     aggregate of the existing per-unit position score over the CPU's own units is
 *     added: positional pressure, cover, threat, cohesion, objectives — the same
 *     opinions the greedy policy holds, now summed over the whole army so a line
 *     that walks into fire scores like one. A tempo term (income × a short horizon)
 *     and a win / loss terminal complete it.
 *
 * Multi-player is PARANOID: every rival is folded into one opponent, with rivals
 * weighted by proximity so a distant third party counts for less than the one at
 * the CPU's throat. Cheap, safe, and what the search plan settled on to start.
 *
 * Must run with the board's state installed (live, or inside `withSimulated`).
 */

export type BelievedSample = {
	/** Unit cost × hp% over the units the observer can perceive (own side: all). */
	army: number
	/** Money on hand plus any builder unit's private wallet. */
	funds: number
	/** Sum of building income this turn. */
	income: number
	units: number
	/** Centroid of the team's perceived units (or buildings), for rival weighting. */
	centroid: { x: number; y: number } | null
}

export type PositionEval = {
	score: number
	own: number
	rivals: number
	phantom: number
	position: number
	tempo: number
	terminal: number
	samples: Record<number, BelievedSample>
}

const unitWorth = (unit: UnitObject): number => {
	const data = unitData[unit.type]
	if (!data) return 0
	const max = data.health || 1
	const health = typeof unit.health === 'number' ? unit.health : max
	const own = data.cost * Math.max(0, Math.min(1, health / max))
	return unit.rescuedUnit ? own + unitWorth(unit.rescuedUnit) : own
}

/**
 * `sampleTeams`, as `observer` believes it: enemy units on concealed tiles do not
 * exist. Eliminated sides read as zero, like the chart. Pure.
 */
export const sampleBelievedTeams = (
	map: MapObject,
	state: GameState,
	observer: number,
	concealed: ReadonlySet<number> = planningConcealed(map, observer)
): Record<number, BelievedSample> => {
	const teams: Record<number, BelievedSample> = {}
	const sums: Record<number, { x: number; y: number; n: number }> = {}
	const lost = new Set(state.players.filter((p) => p.hasLost).map((p) => p.team))
	for (const player of state.players) {
		teams[player.team] = {
			army: 0,
			funds: lost.has(player.team) ? 0 : player.money,
			income: 0,
			units: 0,
			centroid: null,
		}
		sums[player.team] = { x: 0, y: 0, n: 0 }
	}
	for (const { tile, unit } of planningUnits(map)) {
		const sample = teams[unit.team]
		if (!sample || lost.has(unit.team)) continue
		if (unit.team !== observer && concealed.has(tile)) continue
		sample.units += 1 + (unit.rescuedUnit ? 1 : 0)
		sample.army += unitWorth(unit)
		sample.funds += walletOf(unit)
		const s = sums[unit.team]
		s.x += tile % map.cols
		s.y += Math.floor(tile / map.cols)
		s.n++
	}
	for (let tile = 0; tile < map.layers.buildings.length; tile++) {
		const building = map.layers.buildings[tile]
		if (!building) continue
		const sample = teams[building.team]
		if (!sample || lost.has(building.team)) continue
		sample.income += buildingIncome(building)
		// Buildings anchor a side that has no (perceived) units left.
		const s = sums[building.team]
		if (s.n === 0) {
			s.x += tile % map.cols
			s.y += Math.floor(tile / map.cols)
			// Weighted lightly: a building is where the side IS only when it has nothing else.
			s.n += 1e-3
		}
	}
	for (const [team, s] of Object.entries(sums)) {
		if (s.n > 0) teams[Number(team)].centroid = { x: s.x / s.n, y: s.y / s.n }
	}
	return teams
}

/** Believed strength: army plus bank, the chart's "strength" metric. */
export const believedStrength = (sample: BelievedSample | undefined): number =>
	sample ? sample.army + sample.funds : 0

/** Total fog-belief heat the observer carries: how much enemy it thinks is out there. */
const phantomHeat = (state: GameState, observer: number): number => {
	const belief = state.players.find((p) => p.team === observer)?.fogBelief
	if (!belief) return 0
	let heat = 0
	for (const value of Object.values(belief)) heat += value
	return heat
}

const centroidDistance = (
	a: { x: number; y: number } | null,
	b: { x: number; y: number } | null
): number => (a && b ? Math.abs(a.x - b.x) + Math.abs(a.y - b.y) : 0)

/**
 * The evaluation, with its breakdown for the dev page. Positive is good for
 * `cpuTeam`. Opens its own planning window on the board (the memo caches are what
 * make the positional aggregate affordable); nesting inside an outer window is fine.
 */
export const evaluatePositionDetail = (map: MapObject, cpuTeam: number): PositionEval => {
	const state = get(gameState)
	beginCpuPlanning(map)
	try {
		const concealed = planningConcealed(map, cpuTeam)
		const samples = sampleBelievedTeams(map, state, cpuTeam, concealed)

		// Win / loss dominates everything: a line that ends the match is the line.
		const outcome = evaluateWinConditions(state, map)
		let terminal = 0
		if (outcome.gameOver) {
			if (outcome.winner === cpuTeam) terminal = W.EVAL_TERMINAL
			else if (outcome.winner === undefined) terminal = -W.EVAL_TERMINAL / 2
			else terminal = -W.EVAL_TERMINAL
		} else if (outcome.losers.includes(cpuTeam)) {
			terminal = -W.EVAL_TERMINAL
		}

		const mine = samples[cpuTeam]
		const own = believedStrength(mine)

		// Paranoid: rivals fold into one opponent, the near ones counting most. With
		// one rival the weight is 1 and this is simply "my strength minus theirs".
		let rivals = 0
		let rivalIncome = 0
		let rivalCount = 0
		for (const player of state.players) {
			if (player.team === cpuTeam || player.hasLost) continue
			const sample = samples[player.team]
			rivalCount++
			const distance = centroidDistance(mine?.centroid ?? null, sample?.centroid ?? null)
			const weight =
				rivalCount === 1 && state.players.length <= 2
					? 1
					: 1 / (1 + distance / W.EVAL_RIVAL_DISTANCE_SCALE)
			rivals += believedStrength(sample) * weight
			rivalIncome += (sample?.income ?? 0) * weight
		}

		// What the CPU believes is hiding in the fog, priced as enemy it can't see.
		const phantom = phantomHeat(state, cpuTeam) * W.EVAL_PHANTOM_VALUE

		// The positional aggregate: every own unit's opinion of the tile it is on.
		const lurking = lurkingStealthCount(map, cpuTeam)
		let position = 0
		for (const { tile, unit } of planningUnits(map)) {
			if (unit.team !== cpuTeam) continue
			position += scorePositionBonus(map, tile, unit, cpuTeam, concealed, lurking)
		}
		position *= W.EVAL_POSITION_WEIGHT

		const tempo = ((mine?.income ?? 0) - rivalIncome) * W.EVAL_TEMPO_TURNS

		return {
			score: own - rivals - phantom + position + tempo + terminal,
			own,
			rivals,
			phantom,
			position,
			tempo,
			terminal,
			samples,
		}
	} finally {
		endCpuPlanning()
	}
}

/** `evaluatePositionDetail(...).score`. */
export const evaluatePosition = (map: MapObject, cpuTeam: number): number =>
	evaluatePositionDetail(map, cpuTeam).score
