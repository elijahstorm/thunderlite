// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Which sides are still in used to come from scanning the whole event log on
 * every end-turn. It now lives on the room row, written the moment a surrender
 * is recorded. These pin the three things that have to stay true: the field is
 * kept in step by `appendEvent` for every writer, readers prefer the field and
 * only fall back to the log for a room from before the column, and turn
 * rotation skips a quitter without re-reading the log.
 */
const h = vi.hoisted(() => {
	const tables: Record<string, Record<string, unknown>[]> = {}
	const reads: string[] = []
	return { tables, reads }
})

const matches = (row: Record<string, unknown>, where: Record<string, unknown> = {}) =>
	Object.entries(where).every(([column, value]) => {
		if (value && typeof value === 'object' && 'gte' in (value as object)) {
			return Number(row[column]) >= Number((value as { gte: number }).gte)
		}
		return row[column] === value
	})

vi.mock('$lib/Security/serverLogs', () => ({ logToErrorDb: async () => {} }))

vi.mock('$lib/dontcode/server', () => {
	const rowsOf = (table: string) => (h.tables[table] ??= [])
	const db = {
		find: async (table: string, { where, orderBy }: any = {}) => {
			h.reads.push(table)
			const rows = rowsOf(table).filter((r) => matches(r, where))
			const key = orderBy ? Object.keys(orderBy)[0] : null
			return key ? [...rows].sort((a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0)) : rows
		},
		findOne: async (table: string, { where }: any = {}) => {
			h.reads.push(table)
			return rowsOf(table).find((r) => matches(r, where)) ?? null
		},
		insert: async (table: string, data: Record<string, unknown>) => {
			rowsOf(table).push({ ...data })
			return { id: rowsOf(table).length }
		},
		insertIgnoreConflict: async (table: string, data: Record<string, unknown>) => {
			rowsOf(table).push({ ...data })
			return { id: rowsOf(table).length }
		},
		update: async (table: string, where: any, data: Record<string, unknown>) => {
			const hit = rowsOf(table).filter((r) => matches(r, where))
			hit.forEach((r) => Object.assign(r, data))
			return { count: hit.length }
		},
		delete: async (table: string, where: any) => {
			const keep = rowsOf(table).filter((r) => !matches(r, where))
			const count = rowsOf(table).length - keep.length
			h.tables[table] = keep
			return { count }
		},
		count: async (table: string, where: any = {}) => {
			h.reads.push(table)
			return rowsOf(table).filter((r) => matches(r, where)).length
		},
	}
	const kv = {
		get: async () => null,
		set: async () => true,
		del: async () => false,
	}
	return { db, kv, realtime: { tryPublish: async () => {}, publish: async () => 0 } }
})

const { gameStore } = await import('../../src/lib/Game/store.server')

const SESSION = 'room-1'
const A = 'a-session'
const B = 'b-session'
const C = 'c-session'

const seedRoom = (surrendered: number[] | null | undefined) => {
	h.tables.game_room = [
		{
			session: SESSION,
			current_turn: A,
			map_id: 'm',
			expires_at: Date.now() + 60_000,
			...(surrendered === undefined ? {} : { surrendered }),
		},
	]
	h.tables.game_member = [
		{ session: SESSION, user_session: A, seat: 0, team: 0, is_ai: false },
		{ session: SESSION, user_session: B, seat: 1, team: 1, is_ai: false },
		{ session: SESSION, user_session: C, seat: 2, team: 2, is_ai: false },
	]
	h.tables.game_event = []
}

beforeEach(() => {
	for (const key of Object.keys(h.tables)) delete h.tables[key]
	h.reads.length = 0
	seedRoom([])
})

describe('surrendered on the room row', () => {
	it('appendEvent records a surrender on the room, once per team, sorted', async () => {
		await gameStore.appendEvent(SESSION, B, { kind: 'surrender', team: 1 })
		expect(h.tables.game_room[0].surrendered).toEqual([1])
		await gameStore.appendEvent(SESSION, C, { kind: 'surrender', team: 2 })
		await gameStore.appendEvent(SESSION, B, { kind: 'surrender', team: 1 })
		expect(h.tables.game_room[0].surrendered).toEqual([1, 2])
		expect(h.tables.game_event).toHaveLength(3)
	})

	it('other actions leave the field alone', async () => {
		await gameStore.appendEvent(SESSION, A, { kind: 'end-turn', next: 1 })
		expect(h.tables.game_room[0].surrendered).toEqual([])
	})

	it('hasSurrendered reads the field, not the log', async () => {
		h.tables.game_room[0].surrendered = [1]
		h.reads.length = 0
		const room = await gameStore.getRoom(SESSION)
		h.reads.length = 0
		expect(await gameStore.hasSurrendered(SESSION, 1, room)).toBe(true)
		expect(await gameStore.hasSurrendered(SESSION, 0, room)).toBe(false)
		expect(h.reads).toEqual([])
	})

	it('accepts the field as jsonb text too', async () => {
		h.tables.game_room[0].surrendered = '[2]'
		expect(await gameStore.hasSurrendered(SESSION, 2)).toBe(true)
	})

	it('falls back to the log for a room from before the column', async () => {
		seedRoom(undefined)
		h.tables.game_event = [
			{ session: SESSION, seq: 0, user_session: B, action: { kind: 'surrender', team: 1 }, ts: 1 },
		]
		expect(await gameStore.hasSurrendered(SESSION, 1)).toBe(true)
		expect(h.reads).toContain('game_event')
	})

	it('advanceTurn skips a quitter using the rows the caller already holds', async () => {
		h.tables.game_room[0].surrendered = [1]
		const seats = await gameStore.roster(SESSION)
		const room = await gameStore.getRoom(SESSION)
		h.reads.length = 0
		const next = await gameStore.advanceTurn(SESSION, A, null, { seats, room })
		expect(next?.userSession).toBe(C)
		expect(h.tables.game_room[0].current_turn).toBe(C)
		// No roster, room or log re-read: the only touch is the pointer write.
		expect(h.reads).toEqual([])
	})

	it('advanceTurn still rotates correctly when given nothing', async () => {
		h.tables.game_room[0].surrendered = [2]
		const next = await gameStore.advanceTurn(SESSION, A)
		expect(next?.userSession).toBe(B)
		expect(h.reads).not.toContain('game_event')
	})
})
