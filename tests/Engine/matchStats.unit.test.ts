// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	accumulate,
	emptyPlayerStats,
	matchStatsList,
	recordMatchStat,
	resetMatchStats,
	type MatchStatsByTeam,
	type StatEvent,
} from '../../src/lib/Engine/matchStats'
import { applyAction } from '../../src/lib/Engine/applyAction'
import { initGameStateFromMap, resetGameState } from '../../src/lib/Engine/gameState'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

describe('accumulate (pure)', () => {
	const base = (): MatchStatsByTeam => ({ 0: emptyPlayerStats(0) })

	it('counts a build for the acting team', () => {
		const next = accumulate(base(), { kind: 'build', team: 0 })
		expect(next[0].unitsBuilt).toBe(1)
	})

	it('counts a loss for the team whose unit died', () => {
		const next = accumulate(base(), { kind: 'loss', team: 0 })
		expect(next[0].unitsLost).toBe(1)
	})

	it('adds damage dealt for the dealing team', () => {
		const next = accumulate(base(), { kind: 'damage', team: 0, amount: 7 })
		expect(next[0].damageDealt).toBe(7)
	})

	it('counts a capture for the acting team', () => {
		const next = accumulate(base(), { kind: 'capture', team: 0 })
		expect(next[0].tilesCaptured).toBe(1)
	})

	it('counts a turn for the acting team', () => {
		const next = accumulate(base(), { kind: 'turn', team: 0 })
		expect(next[0].turnsTaken).toBe(1)
	})

	it('clamps negative damage to zero', () => {
		const next = accumulate(base(), { kind: 'damage', team: 0, amount: -5 })
		expect(next[0].damageDealt).toBe(0)
	})

	it('seeds an unseen team on first event', () => {
		const next = accumulate({}, { kind: 'build', team: 3 })
		expect(next[3]).toEqual({ ...emptyPlayerStats(3), unitsBuilt: 1 })
	})

	it('is pure — it never mutates the input', () => {
		const input = base()
		const snapshot = JSON.parse(JSON.stringify(input))
		accumulate(input, { kind: 'damage', team: 0, amount: 4 })
		expect(input).toEqual(snapshot)
	})

	it('composes a sequence of events per team', () => {
		const events: StatEvent[] = [
			{ kind: 'build', team: 0 },
			{ kind: 'build', team: 0 },
			{ kind: 'damage', team: 0, amount: 3 },
			{ kind: 'damage', team: 0, amount: 2 },
			{ kind: 'loss', team: 1 },
			{ kind: 'capture', team: 1 },
		]
		const final = events.reduce(accumulate, {} as MatchStatsByTeam)
		expect(final[0]).toMatchObject({ unitsBuilt: 2, damageDealt: 5 })
		expect(final[1]).toMatchObject({ unitsLost: 1, tilesCaptured: 1 })
	})
})

// Integration: stat events are emitted from applyAction only for *live* actions,
// so a reconnect's replayed event log never double-counts (same gate as I3 SFX).
describe('applyAction stat gating', () => {
	const idx = (table: { name: string }[], name: string): number => {
		const i = table.findIndex((t) => t.name === name)
		if (i < 0) throw new Error(`unknown: ${name}`)
		return i
	}
	const PLAINS = idx(terrainData, 'Plains')
	const COMMANDO = idx(unitData, 'Strike Commando')
	const CITY = idx(buildingData, 'City')

	const makeCaptureMap = (): MapObject => {
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
		} as MapObject
		map.layers.units[4] = { type: COMMANDO, state: 0, team: 0, health: unitData[COMMANDO].health }
		map.layers.buildings[4] = { type: CITY, state: 0, team: 1 }
		initGameStateFromMap(map)
		return map
	}

	beforeEach(() => {
		resetGameState()
	})

	it('does not record stats for a replayed (non-live) action', () => {
		const sink = vi.fn()
		applyAction(makeCaptureMap(), { kind: 'capture', tile: 4 }, { recordStat: sink })
		expect(sink).not.toHaveBeenCalled()
	})

	it('records a capture stat for a live action', () => {
		const sink = vi.fn()
		applyAction(makeCaptureMap(), { kind: 'capture', tile: 4 }, { live: true, recordStat: sink })
		expect(sink).toHaveBeenCalledWith({ kind: 'capture', team: 0 })
	})

	it('feeds the shared tracker so matchStatsList reflects live actions', () => {
		resetMatchStats()
		applyAction(makeCaptureMap(), { kind: 'capture', tile: 4 }, { live: true })
		const list = matchStatsList()
		expect(list.find((s) => s.team === 0)?.tilesCaptured).toBe(1)
	})

	// Auto-capture resolves inside endTurn (the next team's Start_Turn phase); the
	// end-turn action credits the capture stat by diffing building ownership.
	const makeAutoCaptureMap = (cityStature: number): MapObject => {
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
		} as MapObject
		// Team 1's commando sits on team 0's city, one tick from flipping.
		map.layers.units[4] = { type: COMMANDO, state: 0, team: 1, health: unitData[COMMANDO].health }
		map.layers.buildings[4] = { type: CITY, state: 0, team: 0, stature: cityStature }
		// Team 0 also has a unit so the roster has two players and the turn can advance.
		map.layers.units[0] = { type: COMMANDO, state: 0, team: 0, health: unitData[COMMANDO].health }
		initGameStateFromMap(map)
		return map
	}

	it('credits a capture stat when a building flips during the end-turn auto-capture', () => {
		const sink = vi.fn()
		// Stature 10 → one full-HP commando tick (−10) flips it as team 1 starts.
		applyAction(makeAutoCaptureMap(10), { kind: 'end-turn' }, { live: true, recordStat: sink })
		expect(sink).toHaveBeenCalledWith({ kind: 'capture', team: 1 })
	})

	it('does NOT credit a capture when the building only partially captures', () => {
		const sink = vi.fn()
		// Stature 20 → one tick (−10) leaves it at 10, no flip, no stat.
		applyAction(makeAutoCaptureMap(20), { kind: 'end-turn' }, { live: true, recordStat: sink })
		expect(sink).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'capture' }))
	})
})
