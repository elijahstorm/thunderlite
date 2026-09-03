// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rooms hold one seat per side their MAP fields, and the sides nobody takes are
 * played by the CPU. Both halves are load-bearing: a side with no member at all
 * has no client to command it, so the match deadlocks the moment the engine's
 * turn rotation reaches it — which is exactly what a three-side map did while
 * rooms were hard-capped at two seats.
 *
 * Exercised through the store against an in-memory stand-in for the DontCode db
 * (same harness as lobbyReady), so capacity, the AI fill and the turn rotation
 * are asserted where they're defined rather than through four endpoints.
 */
const h = vi.hoisted(() => {
	const tables: Record<string, Record<string, unknown>[]> = {}
	return { tables }
})

/**
 * `where` matcher. Comparison operators (`{ seq: { gte: 3 } }`) are part of the
 * real adapter's query language and the event log reads with one, so the
 * stand-in has to understand them — matching them by identity silently returns
 * an EMPTY log, which reads exactly like "nobody has surrendered".
 */
const matches = (row: Record<string, unknown>, where: Record<string, unknown> = {}) =>
	Object.entries(where).every(([column, value]) => {
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const cell = Number(row[column])
			return Object.entries(value as Record<string, number>).every(([op, operand]) => {
				if (op === 'gte') return cell >= operand
				if (op === 'gt') return cell > operand
				if (op === 'lte') return cell <= operand
				if (op === 'lt') return cell < operand
				throw new Error(`unsupported operator in test db stand-in: ${op}`)
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

const { gameStore, roomCapacity, clampCapacity, DEFAULT_MAX_PLAYERS, MAX_ROOM_PLAYERS } =
	await import('../../src/lib/Game/store.server')

const HOST = 'host-session'
const GUEST = 'guest-session'
/** A three-side map, in the engine's stable ascending order. */
const THREE_SIDES = [0, 1, 2]

/** A live room on a three-side map: three seats, host in one of them. */
const threeSideRoom = async () =>
	gameStore.createRoom(HOST, 'map-3p', 'host-auth', { mode: 'live', maxPlayers: 3 })

const capacityOf = async (session: string) => roomCapacity(await gameStore.getRoom(session))

const teamsBySession = async (session: string) => {
	const seats = await gameStore.roster(session)
	return Object.fromEntries(seats.map((s) => [s.userSession, s.team]))
}

beforeEach(() => {
	for (const table of Object.keys(h.tables)) delete h.tables[table]
})

describe('capacity comes from the map', () => {
	it('stores the map-derived seat count on the room', async () => {
		expect(await capacityOf(await threeSideRoom())).toBe(3)
	})

	it('falls back to the default when the map could not be read', async () => {
		const session = await gameStore.createRoom(HOST, 'map-x', 'host-auth', { maxPlayers: null })
		expect(await capacityOf(session)).toBe(DEFAULT_MAX_PLAYERS)
	})

	it('treats a room row predating max_players as a two-seater', async () => {
		const legacyRow = {
			session: 's',
			map_id: 'm',
			current_turn: null,
			expires_at: 0,
			start_at: null,
		}
		expect(roomCapacity(legacyRow)).toBe(2)
	})

	it('clamps a nonsense seat count into the playable range', () => {
		expect(clampCapacity(1)).toBe(2)
		expect(clampCapacity(0)).toBe(2)
		expect(clampCapacity(99)).toBe(MAX_ROOM_PLAYERS)
		expect(clampCapacity('nope')).toBe(DEFAULT_MAX_PLAYERS)
	})

	it('lets a third player into a three-side room', async () => {
		const session = await threeSideRoom()
		expect(await gameStore.ensureMember(session, GUEST, 'guest-auth')).toBe(true)
		expect(await gameStore.ensureMember(session, 'third-session', 'third-auth')).toBe(true)
		expect(await gameStore.ensureMember(session, 'fourth-session', 'fourth-auth')).toBe(false)
		expect(await gameStore.memberCount(session)).toBe(3)
	})

	it('a rematch keeps the seat count instead of dropping back to two', async () => {
		const session = await threeSideRoom()
		const next = await gameStore.rematchRoom(session, HOST, 'host-auth')
		expect(next).toBeTruthy()
		expect(await capacityOf(next as string)).toBe(3)
	})
})

describe('the host starts a half-empty room and CPUs take the rest', () => {
	it('is cleared to start on the humans present, but does not self-start', async () => {
		const session = await threeSideRoom()
		await gameStore.ensureMember(session, GUEST, 'guest-auth')
		await gameStore.setMemberReady(session, HOST, true)
		await gameStore.setMemberReady(session, GUEST, true)

		const ready = await gameStore.readyState(session)
		expect(ready).toMatchObject({ count: 2, capacity: 3, full: false, humansReady: true })
		// The host may launch; the room may not launch itself with a seat still open.
		expect(ready.allReady).toBe(false)
		expect(await gameStore.armStartCountdown(session)).toBeNull()
	})

	it('fills every open seat with a CPU', async () => {
		const session = await threeSideRoom()
		await gameStore.ensureMember(session, GUEST, 'guest-auth')

		expect(await gameStore.fillWithAi(session)).toBe(1)
		expect(await gameStore.memberCount(session)).toBe(3)
		expect((await gameStore.roster(session)).filter((m) => m.isAi)).toHaveLength(1)
		// Idempotent: a full room has nothing left to fill.
		expect(await gameStore.fillWithAi(session)).toBe(0)
	})

	it('gives the filled seats the sides the humans did not take', async () => {
		const session = await threeSideRoom()
		await gameStore.ensureMember(session, GUEST, 'guest-auth')
		await gameStore.setMemberTeam(session, HOST, 2)
		await gameStore.fillWithAi(session)
		await gameStore.assignTeamsIfNeeded(session, THREE_SIDES)

		const teams = await teamsBySession(session)
		expect(teams[HOST]).toBe(2)
		// Every side is now commanded by somebody, which is the whole point.
		expect(Object.values(teams).sort()).toEqual([0, 1, 2])
	})

	it('pins an AI added from the lobby to the side that was clicked', async () => {
		const session = await threeSideRoom()
		await gameStore.setMemberTeam(session, HOST, 0)
		const ai = await gameStore.addAiMember(session, 2)
		await gameStore.assignTeamsIfNeeded(session, THREE_SIDES)

		const teams = await teamsBySession(session)
		// Side 2, not "the first free side" — the bug this replaced left side 2
		// unowned and deadlocked the match on its turn.
		expect(teams[ai as string]).toBe(2)
	})

	it('never exceeds the room capacity', async () => {
		const session = await gameStore.createRoom(HOST, 'map-2p', 'host-auth', { maxPlayers: 2 })
		await gameStore.fillWithAi(session)
		expect(await gameStore.memberCount(session)).toBe(2)
		expect(await gameStore.addAiMember(session)).toBeNull()
	})
})

describe('the turn rotation follows the engine, not the seat order', () => {
	/** Host on side 2, guest on side 0, CPU on side 1 — seat order and team order
	 * deliberately disagree, which is what seat-index rotation got wrong. */
	const mixedRoom = async () => {
		const session = await threeSideRoom()
		await gameStore.ensureMember(session, GUEST, 'guest-auth')
		await gameStore.setMemberTeam(session, HOST, 2)
		await gameStore.setMemberTeam(session, GUEST, 0)
		const ai = await gameStore.addAiMember(session, 1)
		return { session, ai: ai as string }
	}

	it('starts on the map’s first side, whoever holds it', async () => {
		const { session } = await mixedRoom()
		const starter = await gameStore.seedFirstTurn(session, THREE_SIDES)
		expect(starter?.userSession).toBe(GUEST)
		expect(await gameStore.currentTurn(session)).toBe(GUEST)
	})

	it('rotates by ascending team through every side', async () => {
		const { session, ai } = await mixedRoom()
		await gameStore.seedFirstTurn(session, THREE_SIDES)

		expect((await gameStore.resolveNextTurn(session, GUEST))?.team).toBe(1)
		expect((await gameStore.resolveNextTurn(session, ai))?.team).toBe(2)
		// …and wraps back to the first side.
		expect((await gameStore.resolveNextTurn(session, HOST))?.team).toBe(0)
	})

	it('honours the ending client’s next side, so a combat elimination is skipped', async () => {
		const { session } = await mixedRoom()
		// Side 1 (the CPU) was wiped out in combat. Nothing about that reaches the
		// event log, so plain rotation would hand it the turn and stall the match;
		// the engine's own verdict rides along on the end-turn instead.
		expect((await gameStore.resolveNextTurn(session, GUEST, 2))?.team).toBe(2)
	})

	it('skips a side that surrendered', async () => {
		const { session, ai } = await mixedRoom()
		await gameStore.appendEvent(session, ai, { kind: 'surrender', team: 1 })

		expect((await gameStore.resolveNextTurn(session, GUEST))?.team).toBe(2)
		// Even if a client claims the dead side, it is refused.
		expect((await gameStore.resolveNextTurn(session, HOST, 1))?.team).toBe(0)
	})

	it('rotates from a side that just quit to the side AFTER it, not the lowest', async () => {
		const { session, ai } = await mixedRoom()
		// Side 1 (the CPU) forfeits while holding the turn. Every client's engine
		// hands the turn to side 2; the server must agree. Walking the surviving
		// list from its head instead would answer side 0 and every action from
		// side 2 would come back "Not your turn".
		await gameStore.appendEvent(session, ai, { kind: 'surrender', team: 1 })

		expect((await gameStore.resolveNextTurn(session, ai))?.team).toBe(2)
	})

	it('refuses a claim that would hand a player a second turn', async () => {
		const { session } = await mixedRoom()
		expect((await gameStore.resolveNextTurn(session, GUEST, 0))?.team).toBe(1)
	})

	it('honours the claim when it is the only side left', async () => {
		const { session, ai } = await mixedRoom()
		await gameStore.appendEvent(session, ai, { kind: 'surrender', team: 1 })
		await gameStore.appendEvent(session, HOST, { kind: 'surrender', team: 2 })

		expect((await gameStore.resolveNextTurn(session, GUEST, 0))?.team).toBe(0)
	})
})
