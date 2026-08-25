// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * How the app behaves when the DontCode gateway rate limits it.
 *
 * One account-wide limit covers every service call, so the two largest sources
 * of traffic were both background systems nobody was waiting on: the per-client
 * desync trace (`game_log`), written one row per entry, and the error logger,
 * which answered every failure — including a rate limit — with another write.
 * Together they could exhaust the limit that a player's next move needed.
 *
 * These tests pin the three properties that keep a limit from becoming an
 * outage: diagnostics collapse into few writes, a known cooldown stops further
 * optional calls, and reporting a rate limit never costs another call.
 */
const h = vi.hoisted(() => {
	const tables: Record<string, Record<string, unknown>[]> = {}
	const calls = { insert: 0 }
	const fail = { rateLimit: false, timeleft: 56 }
	return { tables, calls, fail }
})

class FakeDontCodeError extends Error {
	status = 429
	body = { error: 'Rate limit exceeded', rate_limit: true, timeleft: h.fail.timeleft }
	constructor() {
		super('Rate limit exceeded. Try again in 56s.')
	}
}

vi.mock('$app/environment', () => ({ dev: false, browser: false, building: false }))

vi.mock('$lib/dontcode/server', () => {
	const rowsOf = (table: string) => (h.tables[table] ??= [])
	const db = {
		find: async (table: string, { where, orderBy }: any = {}) => {
			const rows = rowsOf(table).filter((r) =>
				Object.entries(where ?? {}).every(([k, v]) => r[k] === v)
			)
			const key = orderBy ? Object.keys(orderBy)[0] : null
			return key ? [...rows].sort((a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0)) : rows
		},
		findOne: async () => null,
		insert: async (table: string, data: Record<string, unknown>) => {
			h.calls.insert += 1
			if (h.fail.rateLimit) throw new FakeDontCodeError()
			rowsOf(table).push({ ...data, id: rowsOf(table).length + 1 })
			return { id: rowsOf(table).length }
		},
		insertIgnoreConflict: async () => null,
		update: async () => ({ count: 0 }),
		upsert: async () => {},
		delete: async () => ({ count: 0 }),
		count: async () => 0,
	}
	return {
		db,
		realtime: { tryPublish: async () => {}, publish: async () => 0 },
		isDontCodeError: (e: unknown) => e instanceof FakeDontCodeError,
	}
})

const { gameStore } = await import('../../src/lib/Game/store.server')
const { noteRateLimit, gatewayThrottled, gatewayCooldownSeconds, resetRateLimitState } =
	await import('../../src/lib/Security/rateLimit')
const { logToErrorDb, resetErrorLogState } = await import('../../src/lib/Security/serverLogs')

const SESSION = 'room-1'
const PLAYER = 'player-one'

/** A batch shaped like a real client flush: a burst of moves and board digests. */
const batch = (count: number) =>
	Array.from({ length: count }, (_, i) => ({
		kind: i % 2 === 0 ? 'out' : 'state',
		eventId: i,
		ts: 1_700_000_000_000 + i,
		detail: { digest: `d${i}` },
	}))

beforeEach(() => {
	for (const table of Object.keys(h.tables)) delete h.tables[table]
	h.calls.insert = 0
	h.fail.rateLimit = false
	resetRateLimitState()
	resetErrorLogState()
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('diagnostic trace write volume', () => {
	it('packs a client flush into a handful of rows instead of one per entry', async () => {
		const stored = await gameStore.appendLog(SESSION, PLAYER, batch(60))

		expect(stored).toBe(60)
		// The regression this guards: 60 entries used to mean 60 parallel inserts.
		expect(h.calls.insert).toBeLessThanOrEqual(2)
	})

	it('reads a packed trace back as a flat, chronological entry list', async () => {
		await gameStore.appendLog(SESSION, PLAYER, batch(45))

		const entries = await gameStore.readLog(SESSION)
		expect(entries).toHaveLength(45)
		expect(entries.map((e) => e.eventId)).toEqual(batch(45).map((e) => e.eventId))
		expect(entries[0].userSession).toBe(PLAYER)
		expect(entries[3].kind).toBe('state')
	})

	it('still reads rows written before batching existed', async () => {
		h.tables['game_log'] = [
			{
				id: 1,
				session: SESSION,
				user_session: PLAYER,
				kind: 'desync',
				event_id: 7,
				detail: { reason: 'action-lost' },
				ts: 1_700_000_000_000,
			},
		]

		const entries = await gameStore.readLog(SESSION)
		expect(entries).toHaveLength(1)
		expect(entries[0].kind).toBe('desync')
		expect(entries[0].eventId).toBe(7)
	})

	it('skips the gateway entirely while a cooldown is known', async () => {
		noteRateLimit(new FakeDontCodeError())

		const stored = await gameStore.appendLog(SESSION, PLAYER, batch(60))

		expect(stored).toBe(0)
		expect(h.calls.insert).toBe(0)
	})

	it('learns the cooldown from a rejected write', async () => {
		h.fail.rateLimit = true

		await gameStore.appendLog(SESSION, PLAYER, batch(10))

		expect(gatewayThrottled()).toBe(true)
		expect(gatewayCooldownSeconds()).toBeGreaterThan(50)
	})
})

describe('error logging under a rate limit', () => {
	it('never writes a row about a rate limit', async () => {
		// The amplification loop: reporting a 429 is itself a call against the
		// limit being reported, so under load every error handler added traffic.
		await logToErrorDb(new FakeDontCodeError())

		expect(h.calls.insert).toBe(0)
	})

	it('stops writing once the gateway has refused one write', async () => {
		h.fail.rateLimit = true
		await logToErrorDb(new Error('first failure'))
		expect(h.calls.insert).toBe(1)

		h.fail.rateLimit = false
		await logToErrorDb(new Error('second failure'))
		await logToErrorDb(new Error('third failure'))

		// The breaker holds for the cooldown the gateway named, so a storm costs
		// one failed write rather than one per error.
		expect(h.calls.insert).toBe(1)
	})

	it('collapses a repeating error into a single row', async () => {
		for (let i = 0; i < 20; i++) await logToErrorDb(new Error('the same thing went wrong'))

		expect(h.calls.insert).toBe(1)
	})

	it('still records distinct errors', async () => {
		await logToErrorDb(new Error('one thing'))
		await logToErrorDb(new Error('a different thing'))

		expect(h.calls.insert).toBe(2)
	})

	it('always reaches the console, whatever the database does', async () => {
		h.fail.rateLimit = true
		await logToErrorDb(new Error('boom'), 'While doing a thing')

		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining('While doing a thing: boom'),
			expect.anything()
		)
	})
})
