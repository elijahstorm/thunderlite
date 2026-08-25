// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The batch append contract.
 *
 * Batching exists for a throughput problem, not a latency one. Relays are
 * chained one-in-flight-at-a-time to keep the log in the order the player acted,
 * so a room's action rate equals one `/move` round trip — and each round trip
 * used to cost roughly eight gateway calls against a namespace budgeted at 600
 * a minute for the whole project. A client driving a CPU side produces a turn in
 * a moment and then drips it out for a minute while its own board runs ahead:
 * the host sits on turn 29 while the spectator watches turn 14.
 *
 * So these tests pin two things at once. The cost: a run of N actions must not
 * pay N sets of preflight reads. And the guarantees, every one of which
 * `appendEvent` already made and none of which batching is allowed to weaken —
 * order preserved, duplicates recognised, an overtaking run refused, a reused
 * ordinal carrying a different action refused, and a run cut short reporting
 * exactly what landed so the sender can resume rather than re-send.
 */
const h = vi.hoisted(() => {
	const tables: Record<string, Record<string, unknown>[]> = {}
	const calls: Record<string, number> = {}
	/** Set to make the Nth insert (1-based) throw, standing in for a rate limit. */
	const failInsertAt = { at: 0, error: new Error('rate limited') }
	return { tables, calls, failInsertAt }
})

/** Mirrors the adapter's `Where`: a plain value is equality, an object is ops. */
const matches = (row: Record<string, unknown>, where: Record<string, unknown> = {}) =>
	Object.entries(where).every(([column, value]) => {
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const cell = Number(row[column])
			return Object.entries(value as Record<string, unknown>).every(([op, operand]) => {
				switch (op) {
					case 'equals':
						return row[column] === operand
					case 'gte':
						return cell >= Number(operand)
					case 'gt':
						return cell > Number(operand)
					case 'lte':
						return cell <= Number(operand)
					case 'lt':
						return cell < Number(operand)
					default:
						throw new Error(`unhandled where operator: ${op}`)
				}
			})
		}
		return row[column] === value
	})

vi.mock('$lib/Security/serverLogs', () => ({ logToErrorDb: async () => {} }))

vi.mock('$lib/dontcode/server', () => {
	const rowsOf = (table: string) => (h.tables[table] ??= [])
	const note = (op: string) => {
		h.calls[op] = (h.calls[op] ?? 0) + 1
	}
	const db = {
		find: async (table: string, { where, orderBy }: any = {}) => {
			note('find')
			const rows = rowsOf(table).filter((r) => matches(r, where))
			const key = orderBy ? Object.keys(orderBy)[0] : null
			return key ? [...rows].sort((a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0)) : rows
		},
		findOne: async (table: string, { where }: any = {}) => {
			note('findOne')
			return rowsOf(table).find((r) => matches(r, where)) ?? null
		},
		insert: async (table: string, data: Record<string, unknown>) => {
			note('insert')
			rowsOf(table).push({ ...data })
			return { id: rowsOf(table).length }
		},
		// Honours the real constraints: `(session, seq)` primary key AND the
		// `(session, sender_session, client_seq)` unique index.
		insertIgnoreConflict: async (table: string, data: Record<string, unknown>) => {
			note('insert')
			if (h.failInsertAt.at > 0 && h.calls.insert >= h.failInsertAt.at) throw h.failInsertAt.error
			const rows = rowsOf(table)
			if (table === 'game_event') {
				const clash = rows.some(
					(r) =>
						(r.session === data.session && r.seq === data.seq) ||
						(data.sender_session != null &&
							data.client_seq != null &&
							r.session === data.session &&
							r.sender_session === data.sender_session &&
							r.client_seq === data.client_seq)
				)
				if (clash) return null
			}
			rows.push({ ...data })
			return { id: rows.length }
		},
		update: async (table: string, where: any, data: Record<string, unknown>) => {
			note('update')
			const hit = rowsOf(table).filter((r) => matches(r, where))
			hit.forEach((r) => Object.assign(r, data))
			return { count: hit.length }
		},
		upsert: async (table: string, where: any, data: Record<string, unknown>) => {
			note('upsert')
			const hit = rowsOf(table).filter((r) => matches(r, where))
			if (hit.length) hit.forEach((r) => Object.assign(r, data))
			else rowsOf(table).push({ ...where, ...data })
		},
		delete: async (table: string, where: any) => {
			note('delete')
			const keep = rowsOf(table).filter((r) => !matches(r, where))
			const count = rowsOf(table).length - keep.length
			h.tables[table] = keep
			return { count }
		},
		count: async (table: string, where: any = {}) => {
			note('count')
			return rowsOf(table).filter((r) => matches(r, where)).length
		},
	}
	return { db, realtime: { tryPublish: async () => {}, publish: async () => 0 } }
})

const { gameStore, OutOfOrderEventError, PartialAppendError } =
	await import('../../src/lib/Game/store.server')

const SESSION = 'room-1'
const P1 = 'sender-one'
const AI = 'cpu-seat'

const move = (from: number, to: number) => ({ kind: 'move' as const, from, to })
const attack = (from: number, to: number) => ({ kind: 'attack' as const, from, to })
const endTurn = () => ({ kind: 'end-turn' as const })

const appendRun = (actions: any[], clientSeq: number, sender = P1, actor = sender) =>
	gameStore.appendEvents(SESSION, actor, actions, { senderSession: sender, clientSeq })

const logOf = async () => (await gameStore.events(SESSION, -1)).events

beforeEach(() => {
	for (const table of Object.keys(h.tables)) delete h.tables[table]
	for (const key of Object.keys(h.calls)) delete h.calls[key]
	h.failInsertAt.at = 0
})

describe('batched event append', () => {
	it('records a run in the order it was played, numbered contiguously', async () => {
		const { events, appended } = await appendRun([move(13, 15), attack(15, 16), endTurn()], 0)

		expect(appended).toBe(3)
		expect(events.map((e) => e.id)).toEqual([0, 1, 2])
		const log = await logOf()
		expect(log.map((e) => e.action.kind)).toEqual(['move', 'attack', 'end-turn'])
		expect(h.tables.game_event.map((r) => r.client_seq)).toEqual([0, 1, 2])
	})

	it('pays the preflight cost once for the run, not once per action', async () => {
		await appendRun([move(1, 2), move(3, 4), move(5, 6), move(7, 8), endTurn()], 0)

		// One `count` for the sender's ordinal, one for the room's next seq. The
		// inserts are unavoidable — the gateway has no bulk insert and `seq` has to
		// stay one row per event, because it IS the id clients sync on.
		expect(h.calls.count).toBe(2)
		expect(h.calls.insert).toBe(5)
		// The same run relayed one action at a time cost a count pair per action.
		expect(h.calls.count).toBeLessThan(5 * 2)
	})

	it('recognises a wholly re-sent run instead of recording it twice', async () => {
		const first = await appendRun([move(13, 15), attack(15, 16)], 0)
		const again = await appendRun([move(13, 15), attack(15, 16)], 0)

		expect(again.events.map((e) => e.id)).toEqual(first.events.map((e) => e.id))
		expect((await logOf()).length).toBe(2)
	})

	it('settles the overlap and appends only the remainder of a partly-stored run', async () => {
		await appendRun([move(13, 15), attack(15, 16)], 0)

		// The sender never learned that its first two landed, so it re-sends the
		// whole run with two more behind them.
		const { events, appended } = await appendRun(
			[move(13, 15), attack(15, 16), move(20, 21), endTurn()],
			0
		)

		expect(appended).toBe(4)
		expect(events.map((e) => e.id)).toEqual([0, 1, 2, 3])
		const log = await logOf()
		expect(log.map((e) => e.action.kind)).toEqual(['move', 'attack', 'move', 'end-turn'])
	})

	it('refuses a run that overtook the sender’s earlier actions', async () => {
		await appendRun([move(13, 15)], 0)

		// Ordinal 1 is the next one owed; a run starting at 2 skipped one.
		await expect(appendRun([attack(15, 16), endTurn()], 2)).rejects.toThrow(OutOfOrderEventError)
		expect((await logOf()).length).toBe(1)
	})

	it('refuses a reused ordinal carrying a DIFFERENT action', async () => {
		await appendRun([move(13, 15), attack(15, 16)], 0)

		// A reload restarted the counter at 0, but these are not the same actions.
		// Handing back the stored rows would silently swallow both of these.
		await expect(appendRun([move(90, 91), move(91, 92)], 0)).rejects.toThrow(OutOfOrderEventError)
	})

	it('reports exactly what landed when the run is cut short', async () => {
		// The third insert throws, standing in for a mid-run rate limit.
		h.failInsertAt.at = 3

		const failure = await appendRun([move(1, 2), move(3, 4), move(5, 6), endTurn()], 0).catch(
			(err) => err
		)

		expect(failure).toBeInstanceOf(PartialAppendError)
		expect((failure as InstanceType<typeof PartialAppendError>).events.map((e) => e.id)).toEqual([
			0, 1,
		])
		// The prefix is durably recorded — the sender settles those ordinals and
		// re-sends from the third, rather than re-sending a run the unique index
		// would refuse.
		expect((await logOf()).length).toBe(2)
	})

	it('resumes cleanly from where a cut-short run stopped', async () => {
		h.failInsertAt.at = 3
		await appendRun([move(1, 2), move(3, 4), move(5, 6), endTurn()], 0).catch(() => {})
		h.failInsertAt.at = 0

		const { events } = await appendRun([move(5, 6), endTurn()], 2)

		expect(events.map((e) => e.id)).toEqual([2, 3])
		expect((await logOf()).map((e) => e.action.kind)).toEqual(['move', 'move', 'move', 'end-turn'])
	})

	it('orders a driven CPU run against its driver, crediting the seat', async () => {
		await appendRun([move(13, 15), attack(15, 16), endTurn()], 0, P1, AI)

		const rows = h.tables.game_event
		expect(rows.every((r) => r.sender_session === P1)).toBe(true)
		expect(rows.every((r) => r.user_session === AI)).toBe(true)
		expect(rows.map((r) => r.client_seq)).toEqual([0, 1, 2])
	})

	it('still takes a single action, on the same path as before', async () => {
		const { events, appended } = await appendRun([move(13, 15)], 0)

		expect(appended).toBe(1)
		expect(events[0].id).toBe(0)
	})
})
