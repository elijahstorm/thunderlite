// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DontCodeError } from 'dontcode'

/**
 * How the app behaves when the DontCode gateway rate limits it.
 *
 * The gateway meters each service namespace on its own budget (`db/read`
 * 900/min, `db/write` 300/min, `realtime` 1200/min, `notifications` 60/min, and
 * so on). The two largest spenders of the write budget were both background
 * systems nobody was waiting on: the per-client desync trace (`game_log`),
 * written one row per entry, and the error logger, which answered every failure
 * — including a rate limit — with another write. Together they could exhaust the
 * budget a player's next move needed, and the database's tighter budget is the
 * one they share with it.
 *
 * Since `dontcode@0.2.11` the SDK reports `RateLimit-Remaining` off every
 * counted response, successes included, and names the budget those numbers
 * belong to from `RateLimit-Scope` rather than guessing it from the URL — which
 * is what makes the database's two budgets separable at all. So the app no
 * longer has to be refused before reacting. These tests pin the six properties that keep a limit from becoming
 * an outage: diagnostics collapse into few writes, optional work stands down
 * while headroom is still positive, pressure on one budget never mutes another,
 * a report that names no budget is still attributed to the direction it was
 * spending, a player's move is never the thing shed, and reporting a rate limit
 * never costs another call.
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
			if (h.fail.rateLimit) throw refusal('db/write')
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

	it('skips the gateway entirely while the db/write cooldown is known', async () => {
		noteRateLimit(refusal('db/write'))

		const stored = await gameStore.appendLog(SESSION, PLAYER, batch(60))

		expect(stored).toBe(0)
		expect(h.calls.insert).toBe(0)
	})

	it('learns the cooldown from a rejected write', async () => {
		h.fail.rateLimit = true

		await gameStore.appendLog(SESSION, PLAYER, batch(10))

		expect(gatewayThrottled('db/write')).toBe(true)
		expect(gatewayCooldownSeconds('db/write')).toBeGreaterThan(50)
	})

	it('stands down before being refused, while writes are still succeeding', async () => {
		// The capability the success-path headers exist for: 40 of 300 left is not
		// a refusal, and diagnostics should already be out of the way. Waiting for
		// the 429 means the trace and the player's move hit the wall together, and
		// the move is the one that visibly breaks.
		counted('db/write', 40, 300)

		const stored = await gameStore.appendLog(SESSION, PLAYER, batch(10))

		expect(stored).toBe(0)
		expect(h.calls.insert).toBe(0)
		expect(gatewayThrottled('db/write')).toBe(false)
	})

	it('keeps writing while there is comfortable headroom', async () => {
		counted('db/write', 240, 300)

		const stored = await gameStore.appendLog(SESSION, PLAYER, batch(10))

		expect(stored).toBe(10)
		expect(budgetHeadroom('db/write')).toBeCloseTo(0.8, 2)
	})

	it('still records evidence while merely under pressure', async () => {
		// The carve-out, and the reason for it: standing down on pressure alone
		// meant the recorder went quiet during exactly the incidents it exists to
		// explain. A batch carrying timing or a desync report is written while
		// calls are still succeeding — one insert per flush window, against a
		// budget that refuses at 300 a minute.
		counted('db/write', 40, 300)

		const stored = await gameStore.appendLog(SESSION, PLAYER, [
			...batch(4),
			{ kind: 'perf', eventId: 9, ts: 1_700_000_000_100, detail: { what: 'gauge', owed: 12 } },
		])

		expect(stored).toBe(5)
		expect(h.calls.insert).toBeGreaterThan(0)
	})

	it('goes silent for everything once the gateway has actually refused', async () => {
		// Pressure is a hint; a refusal is not. Nothing diagnostic is worth
		// re-spending a budget the gateway has already closed — the player's next
		// move has to get through it.
		noteRateLimit(refusal('db/write'))

		const stored = await gameStore.appendLog(SESSION, PLAYER, [
			{ kind: 'perf', eventId: 9, ts: 1_700_000_000_100, detail: { what: 'gauge', owed: 12 } },
		])

		expect(stored).toBe(0)
		expect(h.calls.insert).toBe(0)
	})

	it('keeps writing when a different budget is the one that is exhausted', async () => {
		// The regression a single global breaker would cause. `notifications` is
		// the tightest budget the app touches (60/min) and the likeliest to trip,
		// and it has nothing to do with whether the database will take a write.
		noteRateLimit(refusal('notifications'))

		const stored = await gameStore.appendLog(SESSION, PLAYER, batch(10))

		expect(stored).toBe(10)
		expect(gatewayThrottled('db/write')).toBe(false)
	})

	it('keeps writing when the read budget is the exhausted one', async () => {
		// The regression the split exists to prevent, now that the app has to
		// honour it on its side too. Polling spends `db/read` at 900 a minute and
		// is by far the app's largest consumer, so it is the budget most likely to
		// be gone — and it says nothing about whether a write will land.
		noteRateLimit(refusal('db/read'))

		const stored = await gameStore.appendLog(SESSION, PLAYER, batch(10))

		expect(stored).toBe(10)
		expect(gatewayThrottled('db/write')).toBe(false)
	})
})

describe('budget pressure', () => {
	it('reads pressure per namespace, never across them', () => {
		counted('notifications', 2, 60)
		counted('db/write', 250, 300)

		expect(budgetPressure('notifications')).toBe(true)
		expect(budgetPressure('db/write')).toBe(false)
	})

	it('reports no headroom rather than false confidence when nothing was counted', () => {
		expect(budgetHeadroom('db/write')).toBe(null)
		expect(budgetPressure('db/write')).toBe(false)
	})

	it('treats a refusal as zero headroom for the namespace it names', () => {
		counted('db/write', 250, 300)
		noteRateLimit(refusal('db/write'))

		expect(budgetHeadroom('db/write')).toBe(0)
		expect(budgetPressure('db/write')).toBe(true)
	})

	it('keeps the two database budgets apart', () => {
		// One `db` key would let these overwrite each other and leave the app
		// pacing off a number that flips between 900 and 300 depending on which
		// call answered last.
		counted('db/read', 700, 900)
		counted('db/write', 20, 300)

		expect(budgetPressure('db/read')).toBe(false)
		expect(budgetPressure('db/write')).toBe(true)
		expect(budgetHeadroom('db/read')).toBeCloseTo(0.78, 2)
	})

	it('attributes a report that names only `db` to the direction being spent', () => {
		// What a response with no `RateLimit-Scope` leaves us: `POST /api/v1/db`
		// serves both directions, so the URL names a namespace the gateway no
		// longer budgets. The numbers still describe the one bucket it counted, and
		// the caller knows which that was.
		noteRateLimitStatus(
			{ namespace: 'db', remaining: 20, limit: 300, reset: 30, exceeded: false },
			'db/write'
		)

		expect(budgetPressure('db/write')).toBe(true)
		expect(budgetHeadroom('db/read')).toBe(null)
	})

	it('believes the scope the gateway reported over the direction we guessed', () => {
		// `RateLimit-Scope` is authoritative: the gateway is the only party that
		// knows which bucket it charged. A hint that disagrees — a helper that
		// reads before it writes, say — must not be able to redirect a reading onto
		// a budget the response was never about.
		noteRateLimitStatus(
			{ namespace: 'db/read', remaining: 40, limit: 900, reset: 30, exceeded: false },
			'db/write'
		)

		expect(budgetPressure('db/read')).toBe(true)
		expect(budgetHeadroom('db/write')).toBe(null)
	})

	it("accepts the gateway's internal spelling of a namespace", () => {
		noteRateLimit(refusal('db_write'))

		expect(gatewayThrottled('db/write')).toBe(true)
		expect(gatewayThrottled('db/read')).toBe(false)
	})
})

describe('what the player is told', () => {
	it('announces a countdown for a budget a player would notice', () => {
		noteRateLimit(refusal('db/write'))

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
		counted('db/write', 10, 300)

		expect(budgetPressure('db/write')).toBe(true)
		expect(playerFacingCooldownSeconds()).toBe(0)
	})
})

describe('error logging under a rate limit', () => {
	it('never writes a row about a rate limit', async () => {
		// The amplification loop: reporting a 429 is itself a call against the
		// limit being reported, so under load every error handler added traffic.
		await logToErrorDb(refusal('db/write'))

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
