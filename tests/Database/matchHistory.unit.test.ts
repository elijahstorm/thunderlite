// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	composeHistory,
	type HistoryPlayerRow,
	type HistoryMatchRow,
	type HistoryOpponentRow,
	type HistoryProfileRow,
	type HistoryMapRow,
} from '../../src/lib/Database/getMatchHistory'

const mine: HistoryPlayerRow[] = [
	{ id: 30, match_id: 3, team: 0, outcome: 'win', elo_delta: 12 },
	{ id: 20, match_id: 2, team: 1, outcome: 'loss', elo_delta: null },
	{ id: 10, match_id: 1, team: 0, outcome: 'draw', elo_delta: null },
]

const matches: HistoryMatchRow[] = [
	{
		id: 3,
		mode: 'online',
		winner_team: 0,
		turns: 14,
		ended_at: '2026-07-20 10:00:00',
		map_id: 'delta-bay',
		rated: true,
		session_id: 'room-3',
	},
	{
		id: 2,
		mode: 'campaign',
		winner_team: 1,
		turns: 9,
		ended_at: '2026-07-18 10:00:00',
		map_id: null,
		rated: false,
		session_id: null,
	},
	{
		id: 1,
		mode: 'hotseat',
		winner_team: null,
		turns: 21,
		ended_at: null,
		map_id: 'old-canal',
		rated: null,
		session_id: null,
	},
]

const opponents: HistoryOpponentRow[] = [
	{ match_id: 3, user_auth: 'foe-1', team: 1, outcome: 'loss' },
	// A legacy row with no recorded auth resolves to nobody, not a crash.
	{ match_id: 1, user_auth: null, team: 1, outcome: 'draw' },
]

const profiles: HistoryProfileRow[] = [
	{ auth: 'foe-1', username: 'rival', display_name: 'The Rival', profile_image_url: null },
]

const maps: HistoryMapRow[] = [{ public_id: 'delta-bay', name: 'Delta Bay' }]

describe('composeHistory', () => {
	it('returns entries in the order of the player rows (newest-first page)', () => {
		const entries = composeHistory(mine, matches, opponents, profiles, maps)
		expect(entries.map((e) => e.matchId)).toEqual([3, 2, 1])
	})

	it('marks only online matches with a session as reviewable', () => {
		const entries = composeHistory(mine, matches, opponents, profiles, maps)
		expect(entries.find((e) => e.matchId === 3)?.reviewable).toBe(true)
		expect(entries.find((e) => e.matchId === 2)?.reviewable).toBe(false)
		expect(entries.find((e) => e.matchId === 1)?.reviewable).toBe(false)
	})

	it('joins opponents with their profile labels', () => {
		const online = composeHistory(mine, matches, opponents, profiles, maps)[0]
		expect(online.opponents).toHaveLength(1)
		expect(online.opponents[0]).toMatchObject({
			auth: 'foe-1',
			username: 'rival',
			displayName: 'The Rival',
			team: 1,
			outcome: 'loss',
		})
	})

	it('carries elo delta and the rated flag only where the ladder moved', () => {
		const entries = composeHistory(mine, matches, opponents, profiles, maps)
		expect(entries[0].rated).toBe(true)
		expect(entries[0].eloDelta).toBe(12)
		expect(entries[1].rated).toBe(false)
		expect(entries[1].eloDelta).toBeNull()
	})

	it('resolves map names and leaves unknown maps null', () => {
		const entries = composeHistory(mine, matches, opponents, profiles, maps)
		expect(entries[0].mapName).toBe('Delta Bay')
		expect(entries[2].mapName).toBeNull()
	})

	it('skips a player row whose match row is missing instead of rendering it broken', () => {
		const orphan: HistoryPlayerRow[] = [
			{ id: 99, match_id: 999, team: 0, outcome: 'win', elo_delta: null },
		]
		expect(composeHistory(orphan, matches, [], [], [])).toEqual([])
	})

	it('is total on empty input', () => {
		expect(composeHistory([], [], [], [], [])).toEqual([])
	})
})
