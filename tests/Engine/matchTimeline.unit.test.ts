// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import {
	decisivePoint,
	leadChanges,
	leadShare,
	leaderAt,
	matchTimeline,
	matchTimelineList,
	metricValue,
	recordTimelineEnd,
	recordTimelineHandover,
	recordTimelineStart,
	resetMatchTimeline,
	sampleTeams,
	turnPosition,
	type TeamSample,
	type TimelinePoint,
} from '../../src/lib/Engine/matchTimeline'
import { applyAction } from '../../src/lib/Engine/applyAction'
import { gameState, initGameStateFromMap, resetGameState } from '../../src/lib/Engine/gameState'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

const idx = (table: { name: string }[], name: string): number => {
	const i = table.findIndex((t) => t.name === name)
	if (i < 0) throw new Error(`unknown: ${name}`)
	return i
}
const PLAINS = idx(terrainData, 'Plains')
const COMMANDO = idx(unitData, 'Strike Commando')
const CITY = idx(buildingData, 'City')

/** A 3x3 plains board with one commando per side, so nobody wins on turn one. */
const makeMap = (): MapObject => {
	const cols = 3
	const rows = 3
	const map = {
		cols,
		rows,
		layers: {
			ground: new Array(cols * rows).fill(0).map(() => ({ type: PLAINS, state: 0 })),
			sky: new Array(cols * rows).fill(null),
			units: new Array(cols * rows).fill(null),
			buildings: new Array(cols * rows).fill(null),
		},
		highlights: [],
		route: [],
		filters: {} as never,
		funds: 500,
	} as MapObject
	map.layers.units[0] = { type: COMMANDO, state: 0, team: 0, health: unitData[COMMANDO].health }
	map.layers.units[8] = { type: COMMANDO, state: 0, team: 1, health: unitData[COMMANDO].health }
	map.layers.buildings[1] = { type: CITY, state: 0, team: 0 }
	map.layers.buildings[2] = { type: CITY, state: 0, team: 0 }
	map.layers.buildings[7] = { type: CITY, state: 0, team: 1 }
	initGameStateFromMap(map)
	return map
}

const sample = (army: number, funds = 0): TeamSample => ({ army, funds, properties: 0, units: 0 })
const pt = (x: number, armies: Record<number, number>, extra: Partial<TimelinePoint> = {}) => {
	const teams: Record<number, TeamSample> = {}
	for (const [team, army] of Object.entries(armies)) teams[Number(team)] = sample(army)
	return { x, turn: Math.floor(x), afterTeam: null, final: false, teams, ...extra } as TimelinePoint
}

beforeEach(() => {
	resetGameState()
	resetMatchTimeline()
})

describe('sampleTeams', () => {
	it('values each side by unit cost, funds and buildings owned', () => {
		const map = makeMap()
		const teams = sampleTeams(map, get(gameState))
		expect(teams[0]).toEqual({
			army: unitData[COMMANDO].cost,
			funds: 500,
			properties: 2,
			units: 1,
		})
		expect(teams[1]).toEqual({ army: unitData[COMMANDO].cost, funds: 500, properties: 1, units: 1 })
	})

	it('scales a unit by its remaining health', () => {
		const map = makeMap()
		const unit = map.layers.units[0] as UnitObject
		unit.health = unitData[COMMANDO].health / 2
		const teams = sampleTeams(map, get(gameState))
		expect(teams[0].army).toBe(Math.round(unitData[COMMANDO].cost / 2))
	})

	it('counts a carried unit toward its carrier side', () => {
		const map = makeMap()
		const unit = map.layers.units[0] as UnitObject
		unit.rescuedUnit = { type: COMMANDO, state: 0, team: 0 }
		const teams = sampleTeams(map, get(gameState))
		expect(teams[0].units).toBe(2)
		expect(teams[0].army).toBe(unitData[COMMANDO].cost * 2)
	})

	it('reads an eliminated side as zeros, whatever it still holds', () => {
		const map = makeMap()
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) => (p.team === 1 ? { ...p, hasLost: true } : p)),
		}))
		const teams = sampleTeams(map, get(gameState))
		expect(teams[1]).toEqual({ army: 0, funds: 0, properties: 0, units: 0 })
	})
})

describe('turnPosition', () => {
	it('places each seat a fraction of a round along the axis', () => {
		makeMap()
		expect(turnPosition(get(gameState))).toBe(1)
		gameState.update((s) => ({ ...s, currentTeam: 1, turnNumber: 3 }))
		expect(turnPosition(get(gameState))).toBe(3.5)
	})
})

describe('live recording', () => {
	it('starts with the untouched board at x = 1', () => {
		const map = makeMap()
		recordTimelineStart(map)
		const points = matchTimelineList()
		expect(points).toHaveLength(1)
		expect(points[0]).toMatchObject({ x: 1, turn: 1, afterTeam: null, final: false })
	})

	it('samples a live end-turn after the handover, credited to the ending side', () => {
		const map = makeMap()
		recordTimelineStart(map)
		applyAction(map, { kind: 'end-turn' }, { live: true })
		const points = matchTimelineList()
		expect(points).toHaveLength(2)
		expect(points[1]).toMatchObject({ x: 1.5, turn: 1, afterTeam: 0, final: false })
		expect(points[1].teams[1].funds).toBeGreaterThan(500) // city income landed first
	})

	it('ignores a replayed (non-live) end-turn', () => {
		const map = makeMap()
		recordTimelineStart(map)
		applyAction(map, { kind: 'end-turn' })
		expect(matchTimelineList()).toHaveLength(1)
	})

	it('closes the match at the end of the turn in progress, once', () => {
		const map = makeMap()
		recordTimelineStart(map)
		applyAction(map, { kind: 'end-turn' }, { live: true })
		gameState.update((s) => ({ ...s, phase: 'gameOver', winner: 0 }))
		recordTimelineEnd(map)
		recordTimelineEnd(map)
		const points = matchTimelineList()
		expect(points).toHaveLength(3)
		expect(points[2]).toMatchObject({ x: 2, turn: 1, afterTeam: 1, final: true })
	})

	it('never lets two points share an x', () => {
		const map = makeMap()
		recordTimelineStart(map)
		recordTimelineHandover(map, 0)
		expect(matchTimelineList()).toHaveLength(1)
		expect(get(matchTimeline)[0].afterTeam).toBe(0)
	})
})

describe('reading the story', () => {
	const points: TimelinePoint[] = [
		pt(1, { 0: 100, 1: 100 }),
		pt(1.5, { 0: 120, 1: 100 }),
		pt(2, { 0: 120, 1: 150 }),
		pt(2.5, { 0: 200, 1: 150 }),
		pt(3, { 0: 220, 1: 160 }, { final: true }),
	]

	it('reads a metric off a sample', () => {
		expect(metricValue(sample(10, 5), 'strength')).toBe(15)
		expect(metricValue(undefined, 'army')).toBe(0)
	})

	it('names the leader, and nobody for a tie', () => {
		expect(leaderAt(points[0], 'army')).toBeNull()
		expect(leaderAt(points[2], 'army')).toBe(1)
	})

	it('counts the times the lead changed hands', () => {
		expect(leadChanges(points, 'army')).toBe(2)
	})

	it('finds the point the winner took the lead for good', () => {
		expect(decisivePoint(points, 'army', 0)?.x).toBe(2.5)
		expect(decisivePoint(points, 'army', 1)).toBeNull()
		expect(decisivePoint(points, 'army', null)).toBeNull()
	})

	it('has nothing to say when the winner led from the first sample', () => {
		const wireToWire = [pt(1, { 0: 200, 1: 100 }), pt(2, { 0: 300, 1: 100 }, { final: true })]
		expect(decisivePoint(wireToWire, 'army', 0)).toBeNull()
	})

	it('splits time in front by the span each sample owns', () => {
		const share = leadShare(points, 'army')
		expect(share[0]).toBeCloseTo(0.5) // 1.5→2 and 2.5→3
		expect(share[1]).toBeCloseTo(0.25) // 2→2.5
	})
})
