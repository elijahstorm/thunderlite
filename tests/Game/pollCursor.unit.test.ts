// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The poll's cache cursor and the server-driven pacing behind it. The cursor is
 * what lets a reconciliation poll cost one cache read instead of three database
 * reads, so the rules pinned here are about when it moves (turn boundaries, not
 * every action) and about the poll trusting it only when it says nothing is new.
 */
const h = vi.hoisted(() => {
	const tables: Record<string, Record<string, unknown>[]> = {}
	const cache = new Map<string, unknown>()
	const cacheWrites: string[] = []
	const reads: string[] = []
	return { tables, cache, cacheWrites, reads }
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
		delete: async () => ({ count: 0 }),
		count: async (table: string, where: any = {}) => {
			h.reads.push(table)
			return rowsOf(table).filter((r) => matches(r, where)).length
		},
	}
	const kv = {
		get: async (key: string) => h.cache.get(key) ?? null,
		set: async (key: string, value: unknown) => {
			h.cache.set(key, value)
			h.cacheWrites.push(key)
			return true
		},
		del: async (key: string) => h.cache.delete(key),
	}
	return { db, kv, realtime: { tryPublish: async () => {}, publish: async () => 0 } }
})

const { gameStore } = await import('../../src/lib/Game/store.server')
const { pollAfterMsFor, POLL_NORMAL_MS, POLL_PRESSURE_MS, POLL_THROTTLED_MS } =
	await import('../../src/lib/Security/pollPacing')

const SESSION = 'room-1'
const A = 'a-session'

beforeEach(() => {
	for (const key of Object.keys(h.tables)) delete h.tables[key]
	h.cache.clear()
	h.cacheWrites.length = 0
	h.reads.length = 0
	h.tables.game_room = [{ session: SESSION, current_turn: A, map_id: 'm', surrendered: [] }]
	h.tables.game_event = []
})

describe('poll cursor', () => {
	it('is absent until a turn boundary lands', async () => {
		await gameStore.appendEvent(SESSION, A, { kind: 'move', from: 1, to: 2 })
		await gameStore.appendEvent(SESSION, A, { kind: 'wait', tile: 2 })
		expect(await gameStore.readCursor(SESSION)).toBeNull()
		expect(h.cacheWrites).toEqual([])
	})

	it('moves on end-turn to the id of that event', async () => {
		await gameStore.appendEvent(SESSION, A, { kind: 'move', from: 1, to: 2 })
		await gameStore.appendEvent(SESSION, A, { kind: 'end-turn', next: 1 })
		expect(await gameStore.readCursor(SESSION)).toEqual({ lastEventId: 1 })
		expect(h.cacheWrites).toEqual([`cursor:${SESSION}`])
	})

	it('moves on surrender as well', async () => {
		await gameStore.appendEvent(SESSION, A, { kind: 'surrender', team: 0 })
		expect(await gameStore.readCursor(SESSION)).toEqual({ lastEventId: 0 })
	})

	it('moves once for a batch that closes with an end-turn', async () => {
		await gameStore.appendEvents(
			SESSION,
			A,
			[
				{ kind: 'move', from: 1, to: 2 },
				{ kind: 'wait', tile: 2 },
				{ kind: 'end-turn', next: 1 },
			],
			{ senderSession: A, clientSeq: 0 }
		)
		expect(await gameStore.readCursor(SESSION)).toEqual({ lastEventId: 2 })
		expect(h.cacheWrites).toHaveLength(1)
	})

	it('reads a cursor the cache hands back as text', async () => {
		h.cache.set(`cursor:${SESSION}`, JSON.stringify({ lastEventId: 7 }))
		expect(await gameStore.readCursor(SESSION)).toEqual({ lastEventId: 7 })
	})

	it('treats garbage as a miss', async () => {
		h.cache.set(`cursor:${SESSION}`, { nope: true })
		expect(await gameStore.readCursor(SESSION)).toBeNull()
	})
})

describe('poll pacing', () => {
	const none = () => false
	it('is the normal cadence while both namespaces are healthy', () => {
		expect(pollAfterMsFor({ throttled: none, pressure: none })).toBe(POLL_NORMAL_MS)
	})
	it('doubles under low headroom on either namespace the poll spends', () => {
		expect(pollAfterMsFor({ throttled: none, pressure: (s) => s === 'cache' })).toBe(
			POLL_PRESSURE_MS
		)
		expect(pollAfterMsFor({ throttled: none, pressure: (s) => s === 'db/read' })).toBe(
			POLL_PRESSURE_MS
		)
	})
	it('quadruples while either is refusing us, pressure or not', () => {
		expect(pollAfterMsFor({ throttled: (s) => s === 'db/read', pressure: none })).toBe(
			POLL_THROTTLED_MS
		)
		expect(pollAfterMsFor({ throttled: (s) => s === 'cache', pressure: () => true })).toBe(
			POLL_THROTTLED_MS
		)
	})
	it('ignores namespaces the poll does not touch', () => {
		expect(pollAfterMsFor({ throttled: (s) => s === 'notifications', pressure: none })).toBe(
			POLL_NORMAL_MS
		)
	})
})
