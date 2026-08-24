// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The event log's ordering + idempotency contract, exercised through the store
 * against an in-memory stand-in for the DontCode db.
 *
 * The bug this pins down broke a real match (`yvwVsg1V2HRpKHrk`, seq 69/70): an
 * attack was recorded at a LOWER sequence number than the move that put the
 * attacker on its tile, because both requests were in flight at once and `seq`
 * is assigned by whoever wins the insert race. Replaying that log drops the
 * attack — the unit rolls into position and never fires — and the two players'
 * boards never agree again.
 *
 * `clientSeq` is the fix: the sender's own counter, which does carry the order
 * the player acted in. The store refuses to record an event that overtook its
 * own predecessor.
 */
const h = vi.hoisted(() => {
	const tables: Record<string, Record<string, unknown>[]> = {}
	return { tables }
})

/**
 * Mirrors the adapter's `Where`: a plain value is equality, an object is the
 * operator form (`events()` pages with `seq: { gte: n }`).
 */
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
		// Honours the real constraints: `(session, seq)` primary key AND the
		// `(session, sender_session, client_seq)` unique index.
		insertIgnoreConflict: async (table: string, data: Record<string, unknown>) => {
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

const { gameStore, OutOfOrderEventError } = await import('../../src/lib/Game/store.server')

const SESSION = 'room-1'
const P1 = 'sender-one'
const P2 = 'sender-two'

const move = (from: number, to: number) => ({ kind: 'move' as const, from, to })
const attack = (from: number, to: number) => ({ kind: 'attack' as const, from, to })

const append = (action: any, clientSeq: number, sender = P1, actor = sender) =>
	gameStore.appendEvent(SESSION, actor, action, { senderSession: sender, clientSeq })

const logOf = async () => (await gameStore.events(SESSION, -1)).events

beforeEach(() => {
	for (const table of Object.keys(h.tables)) delete h.tables[table]
})

describe('event log ordering', () => {
	it('records a sender’s actions in their own order', async () => {
		await append(move(13, 15), 0)
		await append(attack(15, 16), 1)

		const log = await logOf()
		expect(log.map((e) => e.action.kind)).toEqual(['move', 'attack'])
		expect(log.map((e) => e.id)).toEqual([0, 1])
	})

	/** The match-11 regression, stated directly. */
	it('refuses an attack that overtook the move which enabled it', async () => {
		// The attack's request arrives first, but it is the sender's SECOND action.
		await expect(append(attack(15, 16), 1)).rejects.toBeInstanceOf(OutOfOrderEventError)

		// Nothing was written, so the log cannot be replayed into the broken state.
		expect(await logOf()).toEqual([])

		// Once the move lands, the attack is accepted — behind it, where it belongs.
		await append(move(13, 15), 0)
		await append(attack(15, 16), 1)
		expect((await logOf()).map((e) => e.action.kind)).toEqual(['move', 'attack'])
	})

	it('reports where the sender should resume, so a stale counter self-heals', async () => {
		await append(move(1, 2), 0)
		await append(move(2, 3), 1)

		const err = await append(attack(3, 4), 7).catch((e) => e)
		expect(err).toBeInstanceOf(OutOfOrderEventError)
		expect(err.expected).toBe(2)
		expect(err.received).toBe(7)
	})

	it('treats a re-sent request as a duplicate instead of recording it twice', async () => {
		const first = await append(move(1, 2), 0)
		const again = await append(move(1, 2), 0)

		expect(again.id).toBe(first.id)
		expect(await logOf()).toHaveLength(1)
	})

	it('refuses a reused ordinal carrying a DIFFERENT action', async () => {
		await append(move(1, 2), 0)
		await append(move(2, 3), 1)

		// A reloaded client restarting at 0 must not have its real action swallowed
		// by the unrelated event already stored at that ordinal.
		const err = await append(attack(9, 10), 0).catch((e) => e)
		expect(err).toBeInstanceOf(OutOfOrderEventError)
		expect(err.expected).toBe(2)
		expect(await logOf()).toHaveLength(2)
	})

	it('counts each sender separately', async () => {
		await append(move(1, 2), 0, P1)
		await append(move(9, 8), 0, P2)
		await append(move(2, 3), 1, P1)

		expect(await gameStore.nextClientSeq(SESSION, P1)).toBe(2)
		expect(await gameStore.nextClientSeq(SESSION, P2)).toBe(1)
		expect((await logOf()).map((e) => e.id)).toEqual([0, 1, 2])
	})

	it('orders a relayed CPU action against its driver, not the seat it is credited to', async () => {
		// A human driving a CPU seat relays for both; one request stream, one counter,
		// but the actions are attributed to whoever acted.
		await append(move(1, 2), 0, P1, P1)
		await append(move(50, 51), 1, P1, 'ai-seat')

		const log = await logOf()
		expect(log.map((e) => e.userSession)).toEqual([P1, 'ai-seat'])
		expect(await gameStore.nextClientSeq(SESSION, P1)).toBe(2)
	})

	it('still appends for a client that sends no ordinal at all', async () => {
		await gameStore.appendEvent(SESSION, P1, move(1, 2))
		await gameStore.appendEvent(SESSION, P1, attack(2, 3))

		expect((await logOf()).map((e) => e.action.kind)).toEqual(['move', 'attack'])
	})
})
