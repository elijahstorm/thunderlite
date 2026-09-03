// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The presence sweep that replaced the heartbeat. Presence is a snapshot from
 * the realtime service plus a short memory in the cache, so the rules under
 * test are about not acting on one sighting: a player is resigned only after
 * being seen absent, then seen absent again with the whole grace window gone.
 * CPU seats and the caller are never candidates.
 */
const h = vi.hoisted(() => {
	const tables: Record<string, Record<string, unknown>[]> = {}
	const cache = new Map<string, unknown>()
	const published: unknown[] = []
	return { tables, cache, published }
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
			const rows = rowsOf(table).filter((r) => matches(r, where))
			const key = orderBy ? Object.keys(orderBy)[0] : null
			return key ? [...rows].sort((a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0)) : rows
		},
		findOne: async (table: string, { where }: any = {}) =>
			rowsOf(table).find((r) => matches(r, where)) ?? null,
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
		count: async (table: string, where: any = {}) =>
			rowsOf(table).filter((r) => matches(r, where)).length,
	}
	const kv = {
		get: async (key: string) => h.cache.get(key) ?? null,
		set: async (key: string, value: unknown) => {
			h.cache.set(key, value)
			return true
		},
		del: async (key: string) => h.cache.delete(key),
	}
	const realtime = {
		tryPublish: async (_channel: string, payload: unknown) => {
			h.published.push(payload)
		},
		publish: async () => 0,
	}
	return { db, kv, realtime }
})

const { gameStore, LEAVE_GRACE_MS } = await import('../../src/lib/Game/store.server')

const SESSION = 'room-1'
const HOST = 'host-session'
const GUEST = 'guest-session'
const CPU = 'ai-cpu-seat'
const T0 = 1_700_000_000_000

const roster = [
	{ userSession: HOST, team: 0, isAi: false },
	{ userSession: GUEST, team: 1, isAi: false },
	{ userSession: CPU, team: 2, isAi: true },
]

const seedRoom = (currentTurn: string) => {
	h.tables.game_room = [{ session: SESSION, current_turn: currentTurn, map_id: 'm' }]
	h.tables.game_member = roster.map((m, seat) => ({
		session: SESSION,
		user_session: m.userSession,
		seat,
		team: m.team,
		is_ai: m.isAi,
	}))
	h.tables.game_event = []
}

beforeEach(() => {
	for (const key of Object.keys(h.tables)) delete h.tables[key]
	h.cache.clear()
	h.published.length = 0
	seedRoom(GUEST)
})

describe('sweepDisconnected', () => {
	it('does nothing when everyone human is present', async () => {
		const result = await gameStore.sweepDisconnected(
			SESSION,
			HOST,
			roster,
			new Set([HOST, GUEST]),
			T0
		)
		expect(result).toEqual({ resigned: [], waiting: [] })
		expect(h.tables.game_event).toHaveLength(0)
		expect(h.cache.size).toBe(0)
	})

	it('remembers a first absence and reports it as waiting, without resigning', async () => {
		const result = await gameStore.sweepDisconnected(SESSION, HOST, roster, new Set([HOST]), T0)
		expect(result.resigned).toEqual([])
		expect(result.waiting).toEqual([{ userSession: GUEST, team: 1, sinceMs: 0 }])
		expect(h.cache.get(`absent:${SESSION}:${GUEST}`)).toBe(T0)
		expect(h.tables.game_member.map((m) => m.user_session)).toContain(GUEST)
	})

	it('keeps waiting while the grace window is still open', async () => {
		await gameStore.sweepDisconnected(SESSION, HOST, roster, new Set([HOST]), T0)
		const later = T0 + LEAVE_GRACE_MS - 1000
		const result = await gameStore.sweepDisconnected(SESSION, HOST, roster, new Set([HOST]), later)
		expect(result.resigned).toEqual([])
		expect(result.waiting).toEqual([
			{ userSession: GUEST, team: 1, sinceMs: LEAVE_GRACE_MS - 1000 },
		])
		expect(h.tables.game_event).toHaveLength(0)
	})

	it('resigns after the grace window: surrender logged, seat removed, turn handed to the caller', async () => {
		await gameStore.sweepDisconnected(SESSION, HOST, roster, new Set([HOST]), T0)
		const result = await gameStore.sweepDisconnected(
			SESSION,
			HOST,
			roster,
			new Set([HOST]),
			T0 + LEAVE_GRACE_MS
		)
		expect(result.resigned).toEqual([GUEST])
		expect(result.waiting).toEqual([])
		expect(h.tables.game_event).toHaveLength(1)
		expect(h.tables.game_event[0]).toMatchObject({
			session: SESSION,
			user_session: GUEST,
			action: { kind: 'surrender', team: 1 },
		})
		expect(h.published).toHaveLength(1)
		expect(h.tables.game_member.map((m) => m.user_session)).not.toContain(GUEST)
		// The turn passes to the caller on the surrender row itself; the room
		// column is untouched and the derived pointer reads the row.
		expect(h.tables.game_event[0].next_turn).toBe(HOST)
		expect(h.tables.game_room[0].current_turn).toBe(GUEST)
		expect(await gameStore.currentTurn(SESSION)).toBe(HOST)
		// The memory is cleared so a rejoin later starts a fresh clock.
		expect(h.cache.has(`absent:${SESSION}:${GUEST}`)).toBe(false)
	})

	it('leaves the turn pointer alone when the absentee did not hold it', async () => {
		seedRoom(HOST)
		await gameStore.sweepDisconnected(SESSION, HOST, roster, new Set([HOST]), T0)
		await gameStore.sweepDisconnected(SESSION, HOST, roster, new Set([HOST]), T0 + LEAVE_GRACE_MS)
		expect(h.tables.game_event[0].next_turn).toBe(HOST)
		expect(await gameStore.currentTurn(SESSION)).toBe(HOST)
	})

	it('a return within the window resets the clock', async () => {
		await gameStore.sweepDisconnected(SESSION, HOST, roster, new Set([HOST]), T0)
		// Back for a moment: the sighting is forgotten.
		await gameStore.sweepDisconnected(SESSION, HOST, roster, new Set([HOST, GUEST]), T0 + 5000)
		expect(h.cache.has(`absent:${SESSION}:${GUEST}`)).toBe(false)
		// Gone again past the original grace: still only a first sighting.
		const result = await gameStore.sweepDisconnected(
			SESSION,
			HOST,
			roster,
			new Set([HOST]),
			T0 + LEAVE_GRACE_MS + 5000
		)
		expect(result.resigned).toEqual([])
		expect(result.waiting).toEqual([{ userSession: GUEST, team: 1, sinceMs: 0 }])
	})

	it('never considers CPU seats or the caller', async () => {
		// Nobody present but the caller, twice, past the grace: only the guest goes.
		await gameStore.sweepDisconnected(SESSION, HOST, roster, new Set([HOST]), T0)
		const result = await gameStore.sweepDisconnected(
			SESSION,
			HOST,
			roster,
			new Set([HOST]),
			T0 + LEAVE_GRACE_MS
		)
		expect(result.resigned).toEqual([GUEST])
		expect(h.tables.game_member.map((m) => m.user_session)).toEqual([HOST, CPU])
	})
})
