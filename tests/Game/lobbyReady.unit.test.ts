// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The live lobby's ready gate: a full room must NOT arm its countdown until
 * every human seat has confirmed. Exercised through the store against an
 * in-memory stand-in for the DontCode db, so the rules live in one place and the
 * endpoints (join / lobby / start / the poll's self-heal) all inherit them by
 * calling `armStartCountdown` and `canStart`.
 */
const h = vi.hoisted(() => {
	const tables: Record<string, Record<string, unknown>[]> = {}
	return { tables }
})

const matches = (row: Record<string, unknown>, where: Record<string, unknown> = {}) =>
	Object.entries(where).every(([column, value]) => row[column] === value)

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
		upsert: async (table: string, where: any, data: Record<string, unknown>) => {
			const hit = rowsOf(table).filter((r) => matches(r, where))
			if (hit.length) hit.forEach((r) => Object.assign(r, data))
			else rowsOf(table).push({ ...where, ...data })
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
	return { db, realtime: { tryPublish: async () => {}, publish: async () => 0 } }
})

const { gameStore } = await import('../../src/lib/Game/store.server')

const HOST = 'host-session'
const GUEST = 'guest-session'

/** The room's armed countdown, normalised: the real db returns NULL where the
 * in-memory stand-in simply has no key. */
const startAtOf = async (session: string) => (await gameStore.getRoom(session))?.start_at ?? null

/** A room with both human seats taken, nobody ready yet. */
const fullRoom = async (mode: 'live' | 'async' = 'live') => {
	const session = await gameStore.createRoom(HOST, 'map-1', 'host-auth', {
		mode,
		turnTimeoutMs: mode === 'async' ? 24 * 60 * 60 * 1000 : null,
	})
	await gameStore.addMember(session, GUEST, 'guest-auth')
	return session
}

beforeEach(() => {
	for (const table of Object.keys(h.tables)) delete h.tables[table]
})

describe('live lobby ready gate', () => {
	it('does not arm the countdown while the room is full but un-readied', async () => {
		const session = await fullRoom()

		expect(await gameStore.armStartCountdown(session)).toBeNull()
		expect(await startAtOf(session)).toBeNull()
	})

	it('still holds when only one of the two humans is ready', async () => {
		const session = await fullRoom()
		await gameStore.setMemberReady(session, HOST, true)

		expect(await gameStore.canStart(session, await gameStore.getRoom(session))).toBe(false)
		expect(await gameStore.armStartCountdown(session)).toBeNull()
	})

	it('arms once every human seat is ready', async () => {
		const session = await fullRoom()
		await gameStore.setMemberReady(session, HOST, true)
		await gameStore.setMemberReady(session, GUEST, true)

		const startAt = await gameStore.armStartCountdown(session)
		expect(startAt).toBeGreaterThan(Date.now())
		expect(await startAtOf(session)).toBe(startAt)
	})

	it('reports who the room is still waiting on', async () => {
		const session = await fullRoom()
		await gameStore.setMemberReady(session, HOST, true)

		expect(await gameStore.readyState(session)).toEqual({
			count: 2,
			capacity: 2,
			humans: 2,
			readyHumans: 1,
			full: true,
			humansReady: false,
			allReady: false,
		})
	})

	it('does not arm a half-empty room even when its one player is ready', async () => {
		const session = await gameStore.createRoom(HOST, 'map-1', 'host-auth', { mode: 'live' })
		await gameStore.setMemberReady(session, HOST, true)

		expect(await gameStore.armStartCountdown(session)).toBeNull()
	})

	it('ignores CPU seats: a host plus an AI starts on the host alone', async () => {
		const session = await gameStore.createRoom(HOST, 'map-1', 'host-auth', { mode: 'live' })
		await gameStore.addAiMember(session)

		expect(await gameStore.armStartCountdown(session)).toBeNull()

		await gameStore.setMemberReady(session, HOST, true)
		expect(await gameStore.armStartCountdown(session)).toBeGreaterThan(Date.now())
	})

	it('clearReady un-readies every seat, so a lineup change re-gates the room', async () => {
		const session = await fullRoom()
		await gameStore.setMemberReady(session, HOST, true)
		await gameStore.setMemberReady(session, GUEST, true)
		expect((await gameStore.readyState(session)).allReady).toBe(true)

		await gameStore.clearReady(session)

		expect((await gameStore.readyState(session)).readyHumans).toBe(0)
		expect(await gameStore.armStartCountdown(session)).toBeNull()
	})
})

describe('async lobbies skip the gate', () => {
	it('arms as soon as the room fills, with nobody ready', async () => {
		const session = await fullRoom('async')

		expect(await gameStore.canStart(session, await gameStore.getRoom(session))).toBe(true)
		expect(await gameStore.armStartCountdown(session)).toBeGreaterThan(Date.now())
	})
})
