// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DontCodeError } from 'dontcode'

/**
 * How the app behaves when the DontCode gateway rate limits it.
 *
 * The gateway meters each service namespace on its own budget (`db` 600/min,
 * `realtime` 1200/min, `notifications` 60/min, and so on). The two largest
 * spenders of the `db` budget were both background systems nobody was waiting
 * on: the per-client desync trace (`game_log`), written one row per entry, and
 * the error logger, which answered every failure — including a rate limit —
 * with another write. Together they could exhaust the budget a player's next
 * move needed.
 *
 * Since `dontcode@0.2.9` the SDK reports `RateLimit-Remaining` off every counted
 * response, successes included, so the app no longer has to be refused before
 * reacting. These tests pin the five properties that keep a limit from becoming
 * an outage: diagnostics collapse into few writes, optional work stands down
 * while headroom is still positive, pressure on one budget never mutes another,
 * a player's move is never the thing shed, and reporting a rate limit never
 * costs another call.
 */
const h = vi.hoisted(() => {
	const tables: Record<string, Record<string, unknown>[]> = {}
	const calls = { insert: 0 }
	const fail = { rateLimit: false, timeleft: 56 }
	return { tables, calls, fail }
})

/**
 * The gateway's real refusal, built with the SDK's own error class so the
 * `retryAfter` / `scope` / `rateLimited` accessors behave exactly as they do in
 * production. Faking those getters by hand is how a test ends up passing
 * against a shape the SDK never produces.
 */
const refusal = (scope?: string) =>
	new DontCodeError(429, {
		error: `Rate limit exceeded. Try again in ${h.fail.timeleft}s.`,
		rate_limit: true,
		timeleft: h.fail.timeleft,
		...(scope ? { scope } : {}),
	})

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
			if (h.fail.rateLimit) throw refusal('db')
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
	}
})

const { gameStore } = await import('../../src/lib/Game/store.server')
const {
	noteRateLimit,
	noteRateLimitStatus,
	gatewayThrottled,
	gatewayCooldownSeconds,
	budgetHeadroom,
	budgetPressure,
	playerFacingCooldownSeconds,
	resetRateLimitState,
} = await import('../../src/lib/Security/rateLimit')

/** One counted response, as the SDK's `onRateLimit` hook reports it. */
const counted = (namespace: string, remaining: number, limit: number) =>
	noteRateLimitStatus({ namespace, remaining, limit, reset: 30, exceeded: false })
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

	it('skips the gateway entirely while the db cooldown is known', async () => {
		noteRateLimit(refusal('db'))

		const stored = await gameStore.appendLog(SESSION, PLAYER, batch(60))

		expect(stored).toBe(0)
		expect(h.calls.insert).toBe(0)
	})

	it('learns the cooldown from a rejected write', async () => {
		h.fail.rateLimit = true

		await gameStore.appendLog(SESSION, PLAYER, batch(10))

		expect(gatewayThrottled('db')).toBe(true)
		expect(gatewayCooldownSeconds('db')).toBeGreaterThan(50)
	})

	it('stands down before being refused, while writes are still succeeding', async () => {
		// The capability the success-path headers exist for: 40 of 600 left is not
		// a refusal, and diagnostics should already be out of the way. Waiting for
		// the 429 means the trace and the player's move hit the wall together, and
		// the move is the one that visibly breaks.
		counted('db', 40, 600)

		const stored = await gameStore.appendLog(SESSION, PLAYER, batch(10))

		expect(stored).toBe(0)
		expect(h.calls.insert).toBe(0)
		expect(gatewayThrottled('db')).toBe(false)
	})

	it('keeps writing while there is comfortable headroom', async () => {
		counted('db', 480, 600)

		const stored = await gameStore.appendLog(SESSION, PLAYER, batch(10))

		expect(stored).toBe(10)
		expect(budgetHeadroom('db')).toBeCloseTo(0.8, 2)
	})

	it('keeps writing when a different budget is the one that is exhausted', async () => {
		// The regression a single global breaker would cause. `notifications` is
		// the tightest budget the app touches (60/min) and the likeliest to trip,
		// and it has nothing to do with whether the database will take a write.
		noteRateLimit(refusal('notifications'))

		const stored = await gameStore.appendLog(SESSION, PLAYER, batch(10))

		expect(stored).toBe(10)
		expect(gatewayThrottled('db')).toBe(false)
	})
})

describe('budget pressure', () => {
	it('reads pressure per namespace, never across them', () => {
		counted('notifications', 2, 60)
		counted('db', 500, 600)

		expect(budgetPressure('notifications')).toBe(true)
		expect(budgetPressure('db')).toBe(false)
	})

	it('reports no headroom rather than false confidence when nothing was counted', () => {
		expect(budgetHeadroom('db')).toBe(null)
		expect(budgetPressure('db')).toBe(false)
	})

	it('treats a refusal as zero headroom for the namespace it names', () => {
		counted('db', 500, 600)
		noteRateLimit(refusal('db'))

		expect(budgetHeadroom('db')).toBe(0)
		expect(budgetPressure('db')).toBe(true)
	})
})

describe('what the player is told', () => {
	it('announces a countdown for a budget a player would notice', () => {
		noteRateLimit(refusal('db'))

		expect(playerFacingCooldownSeconds()).toBeGreaterThan(50)
	})

	it('stays silent about budgets nobody is waiting on', () => {
		noteRateLimit(refusal('notifications'))
		noteRateLimit(refusal('payments'))

		expect(playerFacingCooldownSeconds()).toBe(0)
	})

	it('speaks up for a 429 it cannot attribute, rather than assuming it was harmless', () => {
		// A downstream service limiter answering in its own envelope: auth,
		// payments and notifications each have one behind the gateway.
		noteRateLimit(refusal())

		expect(playerFacingCooldownSeconds()).toBeGreaterThan(50)
	})

	it('says nothing while merely under pressure', () => {
		// Standing optional work down early is an internal economy. A banner is a
		// promise that something is actually unavailable, and it isn't.
		counted('db', 10, 600)

		expect(budgetPressure('db')).toBe(true)
		expect(playerFacingCooldownSeconds()).toBe(0)
	})
})

describe('error logging under a rate limit', () => {
	it('never writes a row about a rate limit', async () => {
		// The amplification loop: reporting a 429 is itself a call against the
		// limit being reported, so under load every error handler added traffic.
		await logToErrorDb(refusal('db'))

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
