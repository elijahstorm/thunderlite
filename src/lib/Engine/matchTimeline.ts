import { get, writable } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { gameState, type GameState } from './gameState'
import { walletOf } from './wallet'

/**
 * matchTimeline — how each side's position moved over the course of a match.
 *
 * The stats tracker (`matchStats`) counts what happened; this records what the
 * board looked like. At every turn handover (and at the start and end of the
 * match) it samples every team's army value, funds, and property count, so the
 * results screen can chart who was ahead when and where the game turned. Same
 * live-only rule as the stat sink: a reconnect's replayed log never samples, so
 * the chart is only ever what this client actually watched happen.
 *
 * Points sit on a continuous "rounds" axis: `x = turn + seat / seats`, where
 * `seat` is the position of the team whose turn is about to start. A 1v1 that
 * runs six rounds therefore samples at 1, 1.5, 2, 2.5 … and the final point
 * lands at the moment the match ended, wherever inside a round that fell.
 */

export type TeamSample = {
	/** Sum of unit cost weighted by remaining health. */
	army: number
	/** Money on hand, plus any builder unit's private wallet. */
	funds: number
	/** Buildings owned. */
	properties: number
	/** Units fielded. */
	units: number
}

export type TimelinePoint = {
	/** Position along the match in rounds (turn + seat fraction). */
	x: number
	/** The round the sample was taken in (`gameState.turnNumber`). */
	turn: number
	/** The team whose turn had just ended, or null for the match-start sample. */
	afterTeam: number | null
	/** True for the sample taken as the match ended. */
	final: boolean
	teams: Record<number, TeamSample>
}

export type TimelineMetric = 'strength' | 'army' | 'funds' | 'properties'

export const TIMELINE_METRICS: { key: TimelineMetric; label: string }[] = [
	{ key: 'strength', label: 'Strength' },
	{ key: 'army', label: 'Army' },
	{ key: 'funds', label: 'Funds' },
	{ key: 'properties', label: 'Properties' },
]

/** Read one metric off a sample. Strength is the army's worth plus the bank. */
export const metricValue = (sample: TeamSample | undefined, metric: TimelineMetric): number => {
	if (!sample) return 0
	switch (metric) {
		case 'strength':
			return sample.army + sample.funds
		case 'army':
			return sample.army
		case 'funds':
			return sample.funds
		case 'properties':
			return sample.properties
	}
}

const zeroSample = (): TeamSample => ({ army: 0, funds: 0, properties: 0, units: 0 })

const unitWorth = (unit: UnitObject): number => {
	const data = unitData[unit.type]
	if (!data) return 0
	const max = data.health || 1
	const health = typeof unit.health === 'number' ? unit.health : max
	return data.cost * Math.max(0, Math.min(1, health / max))
}

/**
 * Sample every team's position off the board. Pure: reads the layers and the
 * given state, mutates nothing. An eliminated side reads as zeros — its leftover
 * bank is not strength it can still bring to bear.
 */
export const sampleTeams = (
	map: MapObject | MapProcesser,
	state: GameState
): Record<number, TeamSample> => {
	const teams: Record<number, TeamSample> = {}
	for (const player of state.players) {
		teams[player.team] = player.hasLost ? zeroSample() : { ...zeroSample(), funds: player.money }
	}
	for (const unit of map.layers.units) {
		if (!unit) continue
		const sample = teams[unit.team]
		if (!sample || state.players.find((p) => p.team === unit.team)?.hasLost) continue
		sample.units += 1
		sample.army += unitWorth(unit)
		sample.funds += walletOf(unit)
		if (unit.rescuedUnit) {
			sample.units += 1
			sample.army += unitWorth(unit.rescuedUnit)
		}
	}
	for (const building of map.layers.buildings) {
		if (!building) continue
		const sample = teams[building.team]
		if (!sample || state.players.find((p) => p.team === building.team)?.hasLost) continue
		sample.properties += 1
	}
	for (const sample of Object.values(teams)) {
		sample.army = Math.round(sample.army)
		sample.funds = Math.round(sample.funds)
	}
	return teams
}

/** Where on the rounds axis the current turn begins. */
export const turnPosition = (state: GameState): number => {
	const seats = state.players.length || 1
	const seat = Math.max(
		0,
		state.players.findIndex((p) => p.team === state.currentTeam)
	)
	return state.turnNumber + seat / seats
}

/** Live timeline for the current match. Reset between matches (see GameStateManager). */
export const matchTimeline = writable<TimelinePoint[]>([])

/**
 * Append a point, keeping the axis strictly increasing: a sample that lands on
 * (or behind) the last one replaces it, so a match that ends exactly on a
 * handover never gets two points at the same x.
 */
const push = (point: TimelinePoint): void => {
	matchTimeline.update((points) => {
		const last = points[points.length - 1]
		if (last && point.x <= last.x) return [...points.slice(0, -1), point]
		return [...points, point]
	})
}

/** The match-start sample: the board before anyone has moved. */
export const recordTimelineStart = (map: MapObject | MapProcesser): void => {
	const state = get(gameState)
	matchTimeline.set([
		{
			x: turnPosition(state),
			turn: state.turnNumber,
			afterTeam: null,
			final: state.phase === 'gameOver',
			teams: sampleTeams(map, state),
		},
	])
}

/**
 * Sample after a turn handover. Called by `applyAction` for live end-turns only,
 * once `endTurn` has advanced the state. If that handover also ended the match
 * (a Start_Turn hazard finishing off the last unit, say) the point is final.
 */
export const recordTimelineHandover = (map: MapObject | MapProcesser, afterTeam: number): void => {
	const state = get(gameState)
	const ended = state.phase === 'gameOver'
	push({
		// A handover that ended the match is the end of the match, not the start of
		// a turn nobody will play.
		x: ended ? turnPosition(state) + 1 / (state.players.length || 1) : turnPosition(state),
		turn: state.turnNumber,
		afterTeam,
		final: ended,
		teams: sampleTeams(map, state),
	})
}

/**
 * Sample the board as the match ends mid-turn. Placed at the end of the turn in
 * progress. No-op if the last point is already final (the handover recorded it).
 */
export const recordTimelineEnd = (map: MapObject | MapProcesser): void => {
	const points = get(matchTimeline)
	if (points[points.length - 1]?.final) return
	const state = get(gameState)
	push({
		x: turnPosition(state) + 1 / (state.players.length || 1),
		turn: state.turnNumber,
		afterTeam: state.currentTeam,
		final: true,
		teams: sampleTeams(map, state),
	})
}

export const resetMatchTimeline = (): void => {
	matchTimeline.set([])
}

/** Snapshot for `MatchResult.timeline`. */
export const matchTimelineList = (): TimelinePoint[] => get(matchTimeline)

// --- Reading the story out of the points -----------------------------------

/** The team ahead on `metric` at a point, or null for a tie / empty point. */
export const leaderAt = (point: TimelinePoint, metric: TimelineMetric): number | null => {
	let leader: number | null = null
	let best = -Infinity
	let tied = false
	for (const [team, sample] of Object.entries(point.teams)) {
		const value = metricValue(sample, metric)
		if (value > best) {
			best = value
			leader = Number(team)
			tied = false
		} else if (value === best) {
			tied = true
		}
	}
	return tied ? null : leader
}

/**
 * How many times the lead changed hands. A tie in between doesn't count as a
 * change on its own; the lead only "changes" when a different team takes it.
 */
export const leadChanges = (points: readonly TimelinePoint[], metric: TimelineMetric): number => {
	let changes = 0
	let holder: number | null = null
	for (const point of points) {
		const leader = leaderAt(point, metric)
		if (leader === null) continue
		if (holder !== null && leader !== holder) changes++
		holder = leader
	}
	return changes
}

/**
 * The point from which the winner led to the end without giving the lead up: the
 * moment the match was effectively decided. Null for a draw, when the winner
 * never led, or when they led from the very first sample (nothing "turned").
 */
export const decisivePoint = (
	points: readonly TimelinePoint[],
	metric: TimelineMetric,
	winner: number | null
): TimelinePoint | null => {
	if (winner === null || points.length === 0) return null
	let from = -1
	for (let i = points.length - 1; i >= 0; i--) {
		const leader = leaderAt(points[i], metric)
		if (leader !== null && leader !== winner) break
		if (leader === winner) from = i
	}
	if (from <= 0) return null
	return points[from]
}

/**
 * Share of the match each team spent in the lead, as fractions summing to at
 * most 1 (ties are nobody's). Each point owns the span up to the next one.
 */
export const leadShare = (
	points: readonly TimelinePoint[],
	metric: TimelineMetric
): Record<number, number> => {
	const share: Record<number, number> = {}
	if (points.length < 2) return share
	const total = points[points.length - 1].x - points[0].x
	if (total <= 0) return share
	for (let i = 0; i < points.length - 1; i++) {
		const leader = leaderAt(points[i], metric)
		if (leader === null) continue
		share[leader] = (share[leader] ?? 0) + (points[i + 1].x - points[i].x) / total
	}
	return share
}
