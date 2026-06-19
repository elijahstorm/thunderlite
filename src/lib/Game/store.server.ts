/**
 * Online (H2) multiplayer game store — server-only.
 *
 * This is the single place that used to be backed by Vercel KV (Upstash Redis).
 * That instance was retired with first-party Vercel KV, and the DontCode
 * platform has no KV primitive, so the room/membership/event/turn state now
 * lives in the project's DontCode database via the `db` adapter. Every old KV
 * operation maps onto a relational equivalent, with atomicity preserved through
 * unique constraints (insert-on-conflict) rather than Redis' single-op
 * guarantees — see the `create_game_*` / `create_player_game` migrations.
 *
 *   game:{session} set          → game_member rows (seat = join order)
 *   user-game:{us} hash         → player_game pointer + game_room.sha
 *   game-current:{session}      → game_room.current_turn
 *   game-events:{session} list  → game_event rows (seq = list index)
 *   game-result:{session} lock  → removed; matches.session_id unique IS the lock
 *
 * TTL (`ex`) is emulated with an `expires_at` millisecond epoch: reads treat a
 * room/pointer past its expiry as absent. Abandoned rows linger until then;
 * a periodic sweep can be added later but is not required for correctness.
 */
import { db } from '$lib/dontcode/server'
import { generateKey } from '$lib/Security/keys'
import type { GameEvent, SerializedAction } from '$lib/Engine/Interactor/serializedAction'

export const MAX_PLAYERS = 2
const ROOM_TTL_MS = 1000 * 60 * 60 * 24
const APPEND_RETRIES = 8

type RoomRow = { session: string; sha: string; current_turn: string | null; expires_at: number }
type MemberRow = { user_session: string; seat: number }
type PlayerGameRow = { session: string; expires_at: number }
type EventRow = { seq: number; user_session: string; action: unknown; ts: number }

const now = () => Date.now()
const expired = (expires_at: unknown) => Number(expires_at) <= now()

/** Members of a room, ordered by join seat (creator first). */
async function members(session: string): Promise<string[]> {
	const rows = await db.find<MemberRow>('game_member', {
		where: { session },
		orderBy: { seat: 'asc' },
		select: ['user_session', 'seat'],
	})
	return rows.map((r) => r.user_session)
}

async function isMember(session: string, userSession: string): Promise<boolean> {
	const row = await db.findOne<MemberRow>('game_member', {
		where: { session, user_session: userSession },
		select: ['user_session'],
	})
	return row !== null
}

/** The room row, or null if it doesn't exist or has expired. */
async function getRoom(session: string): Promise<RoomRow | null> {
	const room = await db.findOne<RoomRow>('game_room', { where: { session } })
	if (!room || expired(room.expires_at)) return null
	return room
}

/** The room the player is currently in (with its map sha), or null. */
async function currentGame(userSession: string): Promise<{ session: string; sha: string } | null> {
	const pointer = await db.findOne<PlayerGameRow>('player_game', {
		where: { user_session: userSession },
		select: ['session', 'expires_at'],
	})
	if (!pointer || expired(pointer.expires_at)) return null
	const room = await getRoom(pointer.session)
	if (!room) return null
	return { session: room.session, sha: room.sha }
}

/** Point a player at a room (latest wins), refreshing the TTL. */
async function setPlayerGame(userSession: string, session: string): Promise<void> {
	await db.upsert(
		'player_game',
		{ user_session: userSession },
		{ session, expires_at: now() + ROOM_TTL_MS }
	)
}

/**
 * Create a room for `userSession` on map `sha`. The creator takes seat 0 and the
 * first turn. Returns the shareable session code.
 */
async function createRoom(userSession: string, sha: string): Promise<string> {
	const session = generateKey()
	const expires_at = now() + ROOM_TTL_MS
	await db.insert('game_room', { session, sha, current_turn: userSession, expires_at })
	await db.insert('game_member', { session, user_session: userSession, seat: 0 })
	await setPlayerGame(userSession, session)
	return session
}

/**
 * Claim the next free seat for `userSession`, atomically. Returns the seat, or
 * the existing seat if already a member. The `(session, user_session)` primary
 * key collapses a re-join to a no-op; the per-attempt seat probe + insert-on-
 * conflict prevents two joiners taking the same seat.
 */
async function addMember(session: string, userSession: string): Promise<number> {
	for (let attempt = 0; attempt < APPEND_RETRIES; attempt++) {
		const seat = await db.count('game_member', { session })
		const inserted = await db.insertIgnoreConflict('game_member', {
			session,
			user_session: userSession,
			seat,
		})
		if (inserted) return seat
		// Conflict: either we're already a member, or another joiner took `seat`.
		const mine = await db.findOne<MemberRow>('game_member', {
			where: { session, user_session: userSession },
			select: ['seat'],
		})
		if (mine) return Number(mine.seat)
	}
	throw new Error('Could not assign a seat after retries')
}

async function removeMember(session: string, userSession: string): Promise<void> {
	await db.delete('game_member', { session, user_session: userSession })
}

async function memberCount(session: string): Promise<number> {
	return db.count('game_member', { session })
}

/** Whose turn it is, or null (only transient before a turn is seeded). */
async function currentTurn(session: string): Promise<string | null> {
	const room = await db.findOne<RoomRow>('game_room', {
		where: { session },
		select: ['current_turn'],
	})
	return room?.current_turn ?? null
}

/** Hand the turn to `nextUserSession`. */
async function setCurrentTurn(session: string, nextUserSession: string): Promise<void> {
	await db.update('game_room', { session }, { current_turn: nextUserSession })
}

const toEvent = (row: EventRow): GameEvent => ({
	id: Number(row.seq),
	userSession: row.user_session,
	action: (typeof row.action === 'string' ? JSON.parse(row.action) : row.action) as SerializedAction,
	ts: Number(row.ts),
})

/**
 * Append an action to the room's log and return the stored event. `seq` is the
 * current row count; the `(session, seq)` primary key makes the append atomic —
 * on a lost race we recompute `seq` and retry.
 */
async function appendEvent(
	session: string,
	userSession: string,
	action: SerializedAction
): Promise<GameEvent> {
	for (let attempt = 0; attempt < APPEND_RETRIES; attempt++) {
		const seq = await db.count('game_event', { session })
		const ts = now()
		const inserted = await db.insertIgnoreConflict('game_event', {
			session,
			seq,
			user_session: userSession,
			action,
			ts,
		})
		if (inserted) return { id: seq, userSession, action, ts }
	}
	throw new Error('Could not append game event after retries')
}

/** Events with id > `sinceId`, plus the id of the last event in the room. */
async function events(
	session: string,
	sinceId: number
): Promise<{ events: GameEvent[]; lastEventId: number }> {
	const startIndex = Math.max(0, sinceId + 1)
	const rows = await db.find<EventRow>('game_event', {
		where: { session, seq: { gte: startIndex } },
		orderBy: { seq: 'asc' },
	})
	const total = await db.count('game_event', { session })
	return {
		events: rows.map(toEvent),
		lastEventId: total > 0 ? total - 1 : -1,
	}
}

export const gameStore = {
	members,
	isMember,
	getRoom,
	currentGame,
	setPlayerGame,
	createRoom,
	addMember,
	removeMember,
	memberCount,
	currentTurn,
	setCurrentTurn,
	appendEvent,
	events,
}
