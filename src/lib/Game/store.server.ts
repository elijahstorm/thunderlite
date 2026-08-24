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
 *   user-game:{us} hash         → player_game pointer + game_room.map_id
 *   game-current:{session}      → game_room.current_turn
 *   game-events:{session} list  → game_event rows (seq = list index)
 *   game-result:{session} lock  → removed; matches.session_id unique IS the lock
 *
 * TTL (`ex`) is emulated with an `expires_at` millisecond epoch: reads treat a
 * room/pointer past its expiry as absent. Abandoned rows linger until then;
 * a periodic sweep can be added later but is not required for correctness.
 */
import { db, realtime } from '$lib/dontcode/server'
import { generateKey } from '$lib/Security/keys'
import { clampAsyncTimeout, type GameMode } from '$lib/Game/asyncConfig'
import type { GameEvent, SerializedAction } from '$lib/Engine/Interactor/serializedAction'

/**
 * Seat count bounds. A room's real capacity is `game_room.max_players`, derived
 * from the MAP's side count when the room is created (see `seatsForMap`) — one
 * seat per side the board fields, because a side no member owns deadlocks the
 * match the moment the engine's turn rotation reaches it. These only fence that
 * derived number: two is the smallest playable match, and the ceiling keeps a
 * pathological map from opening an unfillable room.
 */
export const MIN_ROOM_PLAYERS = 2
export const MAX_ROOM_PLAYERS = 8
/** Capacity for a room whose map we couldn't read, and for rows written before
 * `max_players` existed — exactly the old hard-coded behaviour. */
export const DEFAULT_MAX_PLAYERS = 2

/** Clamp any candidate seat count into the playable range. */
export const clampCapacity = (seats: unknown): number => {
	const n = Math.trunc(Number(seats))
	if (!Number.isFinite(n)) return DEFAULT_MAX_PLAYERS
	return Math.min(MAX_ROOM_PLAYERS, Math.max(MIN_ROOM_PLAYERS, n))
}

/** How long the lobby counts down once the room is full before it opens `/play`. */
export const LOBBY_COUNTDOWN_MS = 10_000
/** A player gone from `/play` for this long (no heartbeat) is auto-resigned.
 * Live rooms only — async players are EXPECTED to be gone between turns. */
export const LEAVE_GRACE_MS = 30_000
const ROOM_TTL_MS = 1000 * 60 * 60 * 24
const DAY_MS = 1000 * 60 * 60 * 24
/** How long an async lobby may sit waiting for an opponent before it expires. */
const ASYNC_LOBBY_TTL_MS = 7 * DAY_MS
/** An async room outlives its current turn deadline by this much, so a finished
 * or timed-out game stays visitable (result screen, rematch) for a while. */
const ASYNC_ROOM_GRACE_MS = 7 * DAY_MS
/** Retention for an async room once its match resolved. */
const ASYNC_FINISHED_TTL_MS = 7 * DAY_MS
const APPEND_RETRIES = 8

type RoomRow = {
	session: string
	map_id: string
	current_turn: string | null
	expires_at: number
	start_at: number | null
	is_public?: boolean | null
	lock_random?: boolean | null
	rematch_session?: string | null
	mode?: GameMode | null
	turn_timeout_ms?: number | null
	turn_deadline?: number | null
	max_players?: number | null
}

/**
 * How many seats this room holds. Derived from the map at creation and stored on
 * the row, so every capacity question (join, AI fill, full, ready gate, the
 * public browser) answers from the same number instead of a global constant.
 */
export const roomCapacity = (room: RoomRow | null): number =>
	room?.max_players == null ? DEFAULT_MAX_PLAYERS : clampCapacity(room.max_players)

/** A room created with mode 'async' — turns carry multi-day deadlines. */
const isAsyncRoom = (room: RoomRow | null): room is RoomRow => !!room && room.mode === 'async'

/** A room whose lobby released (start_at set and reached). */
const hasStarted = (room: RoomRow): boolean =>
	room.start_at != null && Number(room.start_at) <= now()

export type AsyncResignResult = {
	resigned: { userSession: string; userAuth: string | null; team: number }
	next: { userSession: string; userAuth: string | null; team: number | null } | null
	gameOver: boolean
	eventId: number
	turnDeadline: number | null
}
type MemberRow = {
	user_session: string
	seat: number
	user_auth?: string | null
	team?: number | null
	is_ai?: boolean | null
	last_seen?: number | null
	ready?: boolean | null
}
type PlayerGameRow = { session: string; expires_at: number }
type EventRow = {
	seq: number
	user_session: string
	action: unknown
	ts: number
	// Ordering columns (see create_game_event_ordering). NULL on rows written
	// before they existed, which is why nothing reads them back except the
	// duplicate lookup in `appendEvent`.
	sender_session?: string | null
	client_seq?: number | null
}

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

/**
 * Members with their public profile auth, ordered by join seat. `userAuth` is
 * the `profiles(auth)` id recorded at join; it's null for legacy rows (joined
 * before the column existed) so the in-game player list falls back to a generic
 * label for that seat. Powers the seat → username/avatar mapping in `/play`.
 */
async function roster(session: string): Promise<
	{
		userSession: string
		seat: number
		userAuth: string | null
		team: number | null
		isAi: boolean
		ready: boolean
	}[]
> {
	const rows = await db.find<MemberRow>('game_member', {
		where: { session },
		orderBy: { seat: 'asc' },
		select: ['user_session', 'seat', 'user_auth', 'team', 'is_ai', 'ready'],
	})
	return rows.map((r) => ({
		userSession: r.user_session,
		seat: Number(r.seat),
		userAuth: r.user_auth ?? null,
		team: r.team == null ? null : Number(r.team),
		isAi: !!r.is_ai,
		ready: !!r.ready,
	}))
}

/** The team a member has been assigned in this room, or null if unassigned. */
async function teamOf(session: string, userSession: string): Promise<number | null> {
	const row = await db.findOne<MemberRow>('game_member', {
		where: { session, user_session: userSession },
		select: ['team'],
	})
	return row && row.team != null ? Number(row.team) : null
}

/**
 * Pre-game readiness, live rooms only (see the `ready` migration). A live lobby
 * holds until every human seat has readied up, so a full room never drops
 * someone into a match they were not looking at.
 */
async function setMemberReady(session: string, userSession: string, ready: boolean): Promise<void> {
	await db.update('game_member', { session, user_session: userSession }, { ready })
}

/**
 * Un-ready every seat in the room. Called whenever the lineup changes (a join, a
 * side change, an AI added, a player removed) so a ready given for one setup
 * can't start a different one — the whole point of the gate.
 */
async function clearReady(session: string): Promise<void> {
	await db.update('game_member', { session }, { ready: false })
}

/**
 * Who the live lobby is still waiting on. `humans` excludes CPU seats (they have
 * no client to press anything, so they never count as pending).
 *
 * Two different gates come out of this. `humansReady` — every human present has
 * confirmed — is what lets the HOST start a room that never filled, whose free
 * seats are then taken by CPUs (`fillWithAi`). `allReady` additionally requires
 * a full house, and is the gate on the AUTOMATIC countdown: a room that fills on
 * its own may only launch itself once every seat is accounted for.
 */
async function readyState(
	session: string,
	roomIn?: RoomRow | null
): Promise<{
	count: number
	capacity: number
	humans: number
	readyHumans: number
	full: boolean
	humansReady: boolean
	allReady: boolean
}> {
	const room = roomIn === undefined ? await getRoom(session) : roomIn
	const capacity = roomCapacity(room)
	const rows = await roster(session)
	const humans = rows.filter((r) => !r.isAi)
	const readyHumans = humans.filter((r) => r.ready).length
	const full = rows.length >= capacity
	const humansReady = humans.length > 0 && readyHumans === humans.length
	return {
		count: rows.length,
		capacity,
		humans: humans.length,
		readyHumans,
		full,
		humansReady,
		allReady: full && humansReady,
	}
}

/**
 * May this room's countdown run BY ITSELF? Live rooms need a full house AND
 * every human readied. Async rooms release on their own: a correspondence
 * opponent is EXPECTED to be away, so waiting on them to press a button would
 * stall the game indefinitely.
 *
 * The host's explicit start is deliberately NOT this gate — see the start
 * endpoint, which accepts `humansReady` and fills the empty seats with CPUs.
 */
async function canStart(session: string, room: RoomRow | null): Promise<boolean> {
	if (!room) return false
	if (isAsyncRoom(room)) return (await memberCount(session)) >= roomCapacity(room)
	return (await readyState(session, room)).allReady
}

/** Explicitly set (or clear) a member's team — used by lobby seat selection. */
async function setMemberTeam(
	session: string,
	userSession: string,
	team: number | null
): Promise<void> {
	await db.update('game_member', { session, user_session: userSession }, { team })
}

/**
 * Team assignment is authoritative and server-owned. Any member still without a
 * team (joined before picking, or picked "random") is given the next of `teams`
 * — the map's stable team order — not already claimed, in seat order. Idempotent:
 * a member with a team keeps it, so this is safe to call on every /play load and
 * whenever the lobby releases. This is what stops two clients both driving team 0
 * (each client used to re-derive its own team from the map and could collide).
 */
async function assignTeamsIfNeeded(session: string, teams: number[]): Promise<void> {
	const rows = await db.find<MemberRow>('game_member', {
		where: { session },
		orderBy: { seat: 'asc' },
		select: ['user_session', 'seat', 'team'],
	})
	const taken = new Set<number>(
		rows
			.map((r) => r.team)
			.filter((t): t is number => t != null)
			.map(Number)
	)
	let cursor = 0
	const nextFreeTeam = (): number | null => {
		while (cursor < teams.length && taken.has(teams[cursor])) cursor++
		return cursor < teams.length ? teams[cursor++] : null
	}
	for (const row of rows) {
		if (row.team != null) continue
		const team = nextFreeTeam()
		if (team == null) break
		taken.add(team)
		await db.update('game_member', { session, user_session: row.user_session }, { team })
	}
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

/** The room the player is currently in (with its map id), or null. */
async function currentGame(
	userSession: string
): Promise<{ session: string; mapId: string; room: RoomRow } | null> {
	const pointer = await db.findOne<PlayerGameRow>('player_game', {
		where: { user_session: userSession },
		select: ['session', 'expires_at'],
	})
	if (!pointer || expired(pointer.expires_at)) return null
	const room = await getRoom(pointer.session)
	if (!room) return null
	// Hand back the room row so callers (the `/play` loader) don't re-fetch it.
	return { session: room.session, mapId: room.map_id, room }
}

/** Point a player at a room (latest wins), refreshing the TTL. */
async function setPlayerGame(userSession: string, session: string): Promise<void> {
	await db.upsert(
		'player_game',
		{ user_session: userSession },
		{ session, expires_at: now() + ROOM_TTL_MS }
	)
}

/** Drop a player's "current room" pointer, but only if it still points at
 * `session` (so we never clear a pointer they've since moved to a new room). */
async function clearPlayerGame(userSession: string, session?: string): Promise<void> {
	const where = session ? { user_session: userSession, session } : { user_session: userSession }
	await db.delete('player_game', where)
}

/** Leave a room: drop membership and the current-room pointer so the player is
 * free to create or join a fresh game (used by finished/abandoned rooms). */
async function leaveGame(session: string, userSession: string): Promise<void> {
	await removeMember(session, userSession)
	await clearPlayerGame(userSession, session)
}

/**
 * Create a room for `userSession` on map `mapId` (a map's `public_id`). The
 * creator takes seat 0 and the first turn. Returns the shareable session code.
 *
 * `opts.mode` picks live (default) or async play at creation; it is immutable
 * afterwards. Async rooms store the host's per-turn clock (clamped to the
 * allowed range) and get a week to find an opponent instead of the live 24h.
 *
 * `opts.maxPlayers` is the room's seat count, which the caller derives from the
 * MAP (`seatsForMap`) — one seat per side the board fields. It is stored on the
 * row so nothing downstream has to decode the map again, and defaults to
 * DEFAULT_MAX_PLAYERS when the map couldn't be read.
 */
async function createRoom(
	userSession: string,
	mapId: string,
	userAuth: string,
	opts?: { mode?: GameMode; turnTimeoutMs?: number | null; maxPlayers?: number | null }
): Promise<string> {
	const session = generateKey()
	const mode: GameMode = opts?.mode === 'async' ? 'async' : 'live'
	const turn_timeout_ms = mode === 'async' ? clampAsyncTimeout(opts?.turnTimeoutMs) : null
	const expires_at = now() + (mode === 'async' ? ASYNC_LOBBY_TTL_MS : ROOM_TTL_MS)
	const max_players =
		opts?.maxPlayers == null ? DEFAULT_MAX_PLAYERS : clampCapacity(opts.maxPlayers)
	await db.insert('game_room', {
		session,
		map_id: mapId,
		current_turn: userSession,
		expires_at,
		mode,
		turn_timeout_ms,
		max_players,
	})
	await db.insert('game_member', {
		session,
		user_session: userSession,
		seat: 0,
		user_auth: userAuth,
	})
	await setPlayerGame(userSession, session)
	return session
}

/**
 * Claim the next free seat for `userSession`, atomically. Returns the seat, or
 * the existing seat if already a member. The `(session, user_session)` primary
 * key collapses a re-join to a no-op; the per-attempt seat probe + insert-on-
 * conflict prevents two joiners taking the same seat.
 */
async function addMember(session: string, userSession: string, userAuth: string): Promise<number> {
	for (let attempt = 0; attempt < APPEND_RETRIES; attempt++) {
		const seat = await db.count('game_member', { session })
		const inserted = await db.insertIgnoreConflict('game_member', {
			session,
			user_session: userSession,
			seat,
			user_auth: userAuth,
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

/**
 * Reserve a seat for a CPU player. Occupies capacity like a human seat (so a
 * room with a host + AI reads as full and starts). AI members never heartbeat,
 * so they're exempt from the absence sweep. Returns the AI's synthetic session.
 *
 * `team` pins the CPU to the side the host clicked. It used to be dropped on the
 * floor, which meant "Add AI" on side 3 produced a CPU that `assignTeamsIfNeeded`
 * then parked on the first FREE side instead — leaving the side the host was
 * actually trying to fill unowned, and the match deadlocked on its turn.
 */
async function addAiMember(session: string, team?: number | null): Promise<string | null> {
	const capacity = roomCapacity(await getRoom(session))
	for (let attempt = 0; attempt < APPEND_RETRIES; attempt++) {
		const seat = await db.count('game_member', { session })
		if (seat >= capacity) return null
		const aiSession = `ai-${generateKey()}`
		const inserted = await db.insertIgnoreConflict('game_member', {
			session,
			user_session: aiSession,
			seat,
			user_auth: null,
			is_ai: true,
			...(team == null ? {} : { team }),
		})
		if (inserted) return aiSession
	}
	return null
}

/**
 * Fill every remaining seat with a CPU. This is what makes a map with more sides
 * than players playable: the host starts whenever the humans present are ready,
 * and the sides nobody took are commanded by the AI (driven by the lowest-seat
 * human — see `aiDriver`) rather than left unowned, which would deadlock the
 * match the moment the turn rotation reached them.
 *
 * Seats are left team-less on purpose; `assignTeamsIfNeeded` hands them whichever
 * sides the humans didn't claim, in the map's stable order. Returns how many
 * CPUs were added.
 */
async function fillWithAi(session: string): Promise<number> {
	const capacity = roomCapacity(await getRoom(session))
	let added = 0
	while ((await memberCount(session)) < capacity) {
		if (!(await addAiMember(session))) break
		added++
	}
	return added
}

/** Is this member a CPU seat? */
async function isAiMember(session: string, userSession: string): Promise<boolean> {
	const row = await db.findOne<MemberRow>('game_member', {
		where: { session, user_session: userSession },
		select: ['is_ai'],
	})
	return !!row?.is_ai
}

/**
 * The human who drives the room's CPU seats — the lowest-seat non-AI member.
 * Their client runs the AI's turns and relays the moves (see GameStateManager /
 * the move endpoint's driver path). Null if there's no human (all-AI room).
 */
async function aiDriver(session: string): Promise<string | null> {
	const rows = await db.find<MemberRow>('game_member', {
		where: { session },
		orderBy: { seat: 'asc' },
		select: ['user_session', 'seat', 'is_ai'],
	})
	return rows.find((r) => !r.is_ai)?.user_session ?? null
}

/**
 * Lock (or unlock) seat selection to random-only. Locking also clears every
 * member's chosen team, so assignment happens fresh at start (see
 * assignTeamsIfNeeded).
 */
async function setLockRandom(session: string, lock: boolean): Promise<void> {
	await db.update('game_room', { session }, { lock_random: lock })
	if (lock) {
		const members = await db.find<MemberRow>('game_member', {
			where: { session },
			select: ['user_session'],
		})
		for (const m of members) {
			await db.update('game_member', { session, user_session: m.user_session }, { team: null })
		}
	}
}

/** Join `session` if there's room (or already a member); refreshes the pointer. */
async function ensureMember(
	session: string,
	userSession: string,
	userAuth: string
): Promise<boolean> {
	if (await isMember(session, userSession)) {
		await setPlayerGame(userSession, session)
		return true
	}
	if ((await memberCount(session)) >= roomCapacity(await getRoom(session))) return false
	await addMember(session, userSession, userAuth)
	await setPlayerGame(userSession, session)
	return true
}

/**
 * The fresh lobby a finished match rematches into. Created once (first caller
 * hosts it); everyone else who hits rematch joins that same new room. Same map,
 * new room — so the old opponents aren't required to return. Returns the new
 * session, or null if the finished room is gone.
 */
async function rematchRoom(
	session: string,
	userSession: string,
	userAuth: string
): Promise<string | null> {
	const room = await getRoom(session)
	if (!room) return null

	if (room.rematch_session) {
		const existing = await getRoom(room.rematch_session)
		if (existing) {
			await ensureMember(existing.session, userSession, userAuth)
			return existing.session
		}
	}

	// A rematch keeps the original room's format: an async game rematches into
	// an async lobby with the same per-turn clock.
	const next = await createRoom(userSession, room.map_id, userAuth, {
		mode: isAsyncRoom(room) ? 'async' : 'live',
		turnTimeoutMs: room.turn_timeout_ms ?? null,
		// Same map, same number of sides — carry the seat count over rather than
		// re-deriving it (and silently dropping to 2 if the map read failed).
		maxPlayers: roomCapacity(room),
	})
	await db.update('game_room', { session }, { rematch_session: next })
	// Lost a race with another rematcher? Prefer the room that landed first.
	const after = await getRoom(session)
	if (after?.rematch_session && after.rematch_session !== next) {
		const winner = await getRoom(after.rematch_session)
		if (winner) {
			await ensureMember(winner.session, userSession, userAuth)
			return winner.session
		}
	}
	return next
}

async function memberCount(session: string): Promise<number> {
	return db.count('game_member', { session })
}

/**
 * A page of joinable public rooms: still filling (start_at null → not counting
 * down / not started), not expired, with at least a host and a free seat.
 * Newest first (by expiry, which tracks creation since TTL is fixed).
 */
async function listPublicRooms(
	page: number,
	pageSize: number
): Promise<{
	rooms: {
		session: string
		mapId: string
		count: number
		maxPlayers: number
		mode: GameMode
		turnTimeoutMs: number | null
	}[]
	hasMore: boolean
}> {
	const rows = await db.find<RoomRow & { is_public?: boolean | null }>('game_room', {
		where: { is_public: true, start_at: null },
		orderBy: { expires_at: 'desc' },
		limit: pageSize + 1,
		offset: Math.max(0, page) * pageSize,
	})
	const live = rows.filter((r) => !expired(r.expires_at))
	const hasMore = live.length > pageSize
	const pageRooms = live.slice(0, pageSize)
	const counts = await Promise.all(pageRooms.map((r) => memberCount(r.session)))
	const rooms = pageRooms
		.map((r, i) => ({
			session: r.session,
			mapId: r.map_id,
			count: counts[i],
			// Per room, not global: a four-side map lists as 1/4, not 1/2.
			maxPlayers: roomCapacity(r),
			// Surfaced in the browser so a joiner knows the pace they sign up for.
			mode: (r.mode === 'async' ? 'async' : 'live') as GameMode,
			turnTimeoutMs: r.turn_timeout_ms == null ? null : Number(r.turn_timeout_ms),
		}))
		// Only rooms that have a host and a free seat are joinable from the browser.
		.filter((r) => r.count > 0 && r.count < r.maxPlayers)
	return { rooms, hasMore }
}

/** Toggle a room's visibility in the public browser. */
async function setPublic(session: string, isPublic: boolean): Promise<void> {
	await db.update('game_room', { session }, { is_public: isPublic })
}

/** Heartbeat: record that `userSession` is still present in the match. */
async function touchMember(session: string, userSession: string): Promise<void> {
	await db.update('game_member', { session, user_session: userSession }, { last_seen: now() })
}

/**
 * Auto-resign anyone (other than the caller) who left the match and hasn't
 * checked in for LEAVE_GRACE_MS. The surrender is authored server-side from
 * their assigned team; the member is then removed so it fires exactly once, and
 * the turn is handed to the caller if it was the absentee's. Best-effort: this
 * is driven off the present player's heartbeat, so it never blocks anything.
 * Returns true if a resign was recorded.
 */
async function sweepAbsent(session: string, poller: string): Promise<boolean> {
	try {
		const stale = (await staleMembers(session, now() - LEAVE_GRACE_MS)).filter(
			(m) => m.userSession !== poller
		)
		if (stale.length === 0) return false
		const current = await currentTurn(session)
		for (const member of stale) {
			if (member.team != null) {
				const event = await appendEvent(session, member.userSession, {
					kind: 'surrender',
					team: member.team,
				})
				await realtime.tryPublish(`game:${session}`, { event })
			}
			await removeMember(session, member.userSession)
			if (current === member.userSession) await setCurrentTurn(session, poller)
		}
		return true
	} catch {
		return false
	}
}

/**
 * Members who last checked in before `cutoff` — i.e. left the match and didn't
 * come back. Members who never heartbeated (last_seen null) are excluded, so a
 * player who hasn't opened /play yet is never auto-resigned.
 */
async function staleMembers(
	session: string,
	cutoff: number
): Promise<{ userSession: string; team: number | null }[]> {
	const rows = await db.find<MemberRow>('game_member', {
		where: { session, last_seen: { lt: cutoff } },
		select: ['user_session', 'team'],
	})
	return rows.map((r) => ({
		userSession: r.user_session,
		team: r.team == null ? null : Number(r.team),
	}))
}

/** The player's join seat (0 = creator/host), or -1 if not a member. */
async function seatOf(session: string, userSession: string): Promise<number> {
	const row = await db.findOne<MemberRow>('game_member', {
		where: { session, user_session: userSession },
		select: ['seat'],
	})
	return row ? Number(row.seat) : -1
}

/**
 * Arm the pre-game countdown: set `start_at` to `now + LOBBY_COUNTDOWN_MS` the
 * first time the room reaches capacity. No-op if it's already armed, so a
 * re-join or a duplicate call never resets the clock out from under a countdown
 * already ticking on every client. Best-effort: a room whose schema predates
 * the `start_at` column just never counts down rather than failing the join.
 *
 * The `canStart` gate lives HERE rather than at the call sites so every path
 * that could arm a countdown (join, the lobby poll's self-heal, an AI filling
 * the last seat) obeys the same rule: a live room waits for every human to
 * ready up, an async room does not.
 */
async function armStartCountdown(session: string): Promise<number | null> {
	const room = await getRoom(session)
	if (!room) return null
	if (room.start_at != null) return Number(room.start_at)
	if (!(await canStart(session, room))) return null
	const start_at = now() + LOBBY_COUNTDOWN_MS
	try {
		await db.update('game_room', { session }, { start_at, ...startPatch(room, start_at) })
		return start_at
	} catch {
		return null
	}
}

/** Host skip: pull the handoff forward to now so the lobby opens `/play` at once. */
async function startNow(session: string): Promise<number> {
	const start_at = now()
	const room = await getRoom(session)
	await db.update('game_room', { session }, { start_at, ...startPatch(room, start_at) })
	return start_at
}

/** The async first-turn clock, armed alongside `start_at`: the deadline runs
 * from game start whether or not the first player ever shows up, and the room's
 * TTL is pushed out so a multi-day game outlives the live 24h window. */
const startPatch = (room: RoomRow | null, start_at: number): Record<string, unknown> => {
	if (!isAsyncRoom(room)) return {}
	const turn_deadline = start_at + clampAsyncTimeout(room.turn_timeout_ms)
	return { turn_deadline, expires_at: turn_deadline + ASYNC_ROOM_GRACE_MS }
}

/** Disarm the countdown (e.g. a player left before it fired) so a later refill
 * re-arms a FRESH 10s rather than resuming a stale/expired clock. Also drops a
 * first-turn deadline armed with it (no-op for live rooms). */
async function disarmCountdown(session: string): Promise<void> {
	await db.update('game_room', { session }, { start_at: null, turn_deadline: null })
}

/**
 * Seed whose turn it is at match start to the member on the ENGINE's first team
 * (the lowest team number — see initGameStateFromMap's `players[0].team`), not
 * the room creator. With lobby seat selection the creator may have picked a
 * later side, so seeding to the creator desynced the server's turn pointer from
 * the engine (both players ended up driving the first team). Only runs before
 * any move has been recorded, so it never disturbs a turn already in progress.
 */
async function seedFirstTurn(
	session: string,
	teams: number[]
): Promise<{ userSession: string; userAuth: string | null } | null> {
	if (!teams.length) return null
	if ((await db.count('game_event', { session })) > 0) return null
	const startingTeam = teams[0]
	const starter = (await roster(session)).find((m) => m.team === startingTeam)
	if (!starter) return null
	await setCurrentTurn(session, starter.userSession)
	// Hand the starter back so the async flow can email them "your move" when
	// somebody ELSE's /play load is what released the game.
	return { userSession: starter.userSession, userAuth: starter.userAuth }
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
	action: (typeof row.action === 'string'
		? JSON.parse(row.action)
		: row.action) as SerializedAction,
	ts: Number(row.ts),
})

/**
 * Do two events carry the same action? Compared on canonically ordered keys, so
 * a round trip through jsonb (which does not preserve key order) still matches.
 */
const sameAction = (row: EventRow, action: SerializedAction): boolean => {
	const stored = (typeof row.action === 'string' ? JSON.parse(row.action) : row.action) as Record<
		string,
		unknown
	>
	const canon = (value: Record<string, unknown>): string =>
		JSON.stringify(
			Object.keys(value)
				.sort()
				.map((key) => [key, value[key]])
		)
	return canon(stored) === canon(action as unknown as Record<string, unknown>)
}

/** An append refused because it would record history out of order. */
export class OutOfOrderEventError extends Error {
	constructor(
		readonly expected: number,
		readonly received: number
	) {
		super(`Event arrived out of order (expected client_seq ${expected}, got ${received})`)
		this.name = 'OutOfOrderEventError'
	}
}

/**
 * Where a sender's next event belongs in its own stream: the count of events it
 * has already relayed. Contiguous by construction — `appendEvent` refuses any
 * gap — so the count IS the next expected `client_seq`.
 */
async function nextClientSeq(session: string, senderSession: string): Promise<number> {
	return db.count('game_event', { session, sender_session: senderSession })
}

/**
 * Append an action to the room's log and return the stored event.
 *
 * Two different orderings are at play, and conflating them is what broke match
 * 11 (`yvwVsg1V2HRpKHrk`, seq 69/70 — an attack recorded before the move that
 * put the attacker on the tile, which every client except the sender then
 * replayed as "the unit moved and never fired").
 *
 *   `seq` is the room's log position, taken from the row count. The
 *   `(session, seq)` primary key makes claiming one atomic; a lost race
 *   recomputes and retries. But it records the order requests WIN THE INSERT
 *   RACE, which for two overlapping requests is a coin flip — not the order a
 *   player acted in.
 *
 *   `clientSeq` is the sender's own 0-based counter, so it DOES carry the order
 *   the player acted in. When it's supplied, this refuses to append an event
 *   whose predecessor from the same sender isn't in the log yet: a request that
 *   overtook its own predecessor is rejected (`OutOfOrderEventError`) rather
 *   than recorded in the wrong place, and the caller retries once the earlier
 *   one lands. A `clientSeq` we've already stored is a duplicate — a browser
 *   retry, a double-fired handler — and returns the existing row instead of
 *   appending the same action twice.
 *
 * `senderSession` is the authenticated caller, which is not always the acting
 * seat: a human driving a CPU seat relays actions attributed to the AI. Ordering
 * follows the SENDER (one stream of requests, one counter), attribution follows
 * `userSession`.
 *
 * Callers that pass no `clientSeq` (a legacy client) keep the old behaviour
 * exactly, unordered and non-idempotent.
 *
 * `ts` is stamped ONCE, before the loop. It used to be re-stamped inside it, so
 * the row that lost a race carried the time of its retry rather than the time it
 * arrived — which makes a misordered log look perfectly consistent. That cost
 * real time diagnosing this bug and is not worth repeating.
 */
async function appendEvent(
	session: string,
	userSession: string,
	action: SerializedAction,
	options: { senderSession?: string; clientSeq?: number } = {}
): Promise<GameEvent> {
	const ts = now()
	const { senderSession, clientSeq } = options
	const ordered = senderSession !== undefined && clientSeq !== undefined

	if (ordered) {
		const expected = await nextClientSeq(session, senderSession)
		if (clientSeq < expected) {
			const existing = await db.findOne<EventRow>('game_event', {
				where: { session, sender_session: senderSession, client_seq: clientSeq },
			})
			// Behind the counter means one of two very different things, and telling
			// them apart matters: if the stored action is the SAME one, this is a
			// genuine duplicate (a browser retry) and the stored row is the answer. If
			// it's a DIFFERENT action, the sender's counter is stale — it reloaded and
			// restarted at 0 — and honouring it would silently swallow a real action
			// by handing back an unrelated old event. Refuse, and the error carries the
			// value the sender should resume from.
			if (existing && sameAction(existing, action)) return toEvent(existing)
			if (existing) throw new OutOfOrderEventError(expected, clientSeq)
			// Counted but not found (a concurrent insert mid-read): fall through and
			// let the unique index adjudicate.
		} else if (clientSeq > expected) {
			// This request overtook one of its own predecessors. Recording it here is
			// precisely the corruption we are preventing.
			throw new OutOfOrderEventError(expected, clientSeq)
		}
	}

	for (let attempt = 0; attempt < APPEND_RETRIES; attempt++) {
		const seq = await db.count('game_event', { session })
		const inserted = await db.insertIgnoreConflict('game_event', {
			session,
			seq,
			user_session: userSession,
			action,
			ts,
			...(ordered ? { sender_session: senderSession, client_seq: clientSeq } : {}),
		})
		if (inserted) return { id: seq, userSession, action, ts }
		// A conflict is ambiguous: we may have lost the race for `seq` (retry with a
		// fresh one), or hit the sender's unique index because this exact event is
		// already stored (return it — retrying would spin until it threw).
		if (ordered) {
			const existing = await db.findOne<EventRow>('game_event', {
				where: { session, sender_session: senderSession, client_seq: clientSeq },
			})
			if (existing) return toEvent(existing)
		}
	}
	throw new Error('Could not append game event after retries')
}

/** Events with id > `sinceId`, plus the id of the last event in the room. */
async function events(
	session: string,
	sinceId: number
): Promise<{ events: GameEvent[]; lastEventId: number }> {
	const startIndex = Math.max(0, sinceId + 1)
	// Independent reads — the page of new events and the total count don't depend
	// on each other, so run them in one barrier rather than back to back. This is
	// the polled sync path, so the saved round-trip lands on every open game.
	const [rows, total] = await Promise.all([
		db.find<EventRow>('game_event', {
			where: { session, seq: { gte: startIndex } },
			orderBy: { seq: 'asc' },
		}),
		db.count('game_event', { session }),
	])
	return {
		events: rows.map(toEvent),
		lastEventId: total > 0 ? total - 1 : -1,
	}
}

// ── Diagnostic client trace (`game_log`) ─────────────────────────────────────
// Observational, not authoritative. `game_event` records what the server was
// told; this records what each individual CLIENT sent, received, and computed —
// the half of the picture that's missing whenever two boards diverge, since the
// shared event log looks identical to both of them. Nothing in gameplay reads
// these rows, so every write here is best-effort and must never be able to fail
// a move (see the log route, which swallows its own errors).

/** One recorded client observation. `eventId` is the `game_event.seq` it hangs off. */
export type GameLogEntry = {
	kind: string
	eventId: number
	detail: Record<string, unknown>
	ts: number
}

/** Cap per request so one client can't flood the table with a single POST. */
export const MAX_LOG_ENTRIES_PER_BATCH = 60
/** Cap on one entry's serialized `detail`, to fence a runaway board snapshot. */
export const MAX_LOG_DETAIL_BYTES = 8_000

const LOG_KINDS = new Set(['out', 'in', 'state', 'chat', 'desync', 'note'])

/** Coerce one client-supplied entry into a storable row, or null if unusable. */
const sanitizeLogEntry = (raw: unknown): GameLogEntry | null => {
	if (!raw || typeof raw !== 'object') return null
	const v = raw as Record<string, unknown>
	const kind = typeof v.kind === 'string' && LOG_KINDS.has(v.kind) ? v.kind : null
	if (!kind) return null
	const detail = v.detail && typeof v.detail === 'object' ? (v.detail as Record<string, unknown>) : {}
	// Oversized details are truncated to a marker rather than rejected — losing the
	// payload of one entry is much better than losing the entry (and its position
	// in the trace) entirely.
	const serialized = JSON.stringify(detail)
	const safeDetail =
		serialized.length > MAX_LOG_DETAIL_BYTES
			? { truncated: true, bytes: serialized.length, head: serialized.slice(0, 512) }
			: detail
	const eventId =
		typeof v.eventId === 'number' && Number.isInteger(v.eventId) ? v.eventId : -1
	const ts = typeof v.ts === 'number' && Number.isFinite(v.ts) ? v.ts : now()
	return { kind, eventId, detail: safeDetail, ts }
}

/**
 * Append a batch of client observations. Rows are written independently so one
 * bad entry can't lose the rest of the batch, and every failure is swallowed:
 * diagnostics must never be able to break the game they are diagnosing.
 * Returns how many rows landed.
 */
async function appendLog(
	session: string,
	userSession: string,
	rawEntries: unknown[]
): Promise<number> {
	const entries = rawEntries
		.slice(0, MAX_LOG_ENTRIES_PER_BATCH)
		.map(sanitizeLogEntry)
		.filter((e): e is GameLogEntry => e !== null)
	if (entries.length === 0) return 0
	const results = await Promise.allSettled(
		entries.map((entry) =>
			db.insert('game_log', {
				session,
				user_session: userSession,
				kind: entry.kind,
				event_id: entry.eventId,
				detail: entry.detail,
				ts: entry.ts,
			})
		)
	)
	return results.filter((r) => r.status === 'fulfilled').length
}

/** The whole trace for a room, oldest first — what the debug reader renders. */
async function readLog(
	session: string,
	limit = 1000
): Promise<
	{ id: number; userSession: string; kind: string; eventId: number; detail: unknown; ts: number }[]
> {
	const rows = await db.find<{
		id: number
		user_session: string
		kind: string
		event_id: number
		detail: unknown
		ts: string | number
	}>('game_log', {
		where: { session },
		orderBy: { id: 'asc' },
		limit,
	})
	return rows.map((row) => ({
		id: Number(row.id),
		userSession: row.user_session,
		kind: row.kind,
		eventId: Number(row.event_id),
		detail: typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail,
		ts: Number(row.ts),
	}))
}

// ── Async (correspondence) play ───────────────────────────────────────────────
// Async rooms reuse the whole live pipeline (event log, turn pointer, replay);
// what differs is time: turns carry a multi-day deadline, a missed deadline is
// an auto-resign, and the room's TTL tracks the deadline instead of a fixed 24h.

/** True once a match row exists — the game resolved and results were recorded. */
async function matchRecorded(session: string): Promise<boolean> {
	const row = await db.findOne<{ id: number }>('matches', {
		where: { session_id: session },
		select: ['id'],
	})
	return row !== null
}

/**
 * Seats plus the teams already out of the game (surrender events in the log).
 * The log is the source of truth for "who is still in" server-side — the
 * engine's `hasLost` lives only in clients, which is why an elimination BY
 * COMBAT can't be seen from here (see `advanceTurn`, which takes the ending
 * client's word for that one case). Used by the live turn rotation as well as
 * the async deadline paths.
 */
async function standing(
	session: string
): Promise<{ seats: Awaited<ReturnType<typeof roster>>; surrendered: Set<number> }> {
	const [seats, log] = await Promise.all([roster(session), events(session, -1)])
	const surrendered = new Set<number>()
	for (const e of log.events) {
		if (e.action?.kind === 'surrender' && typeof e.action.team === 'number') {
			surrendered.add(e.action.team)
		}
	}
	return { seats, surrendered }
}

/**
 * Members still in the game, in the ENGINE's turn order: ascending team number,
 * which is exactly how `nextActiveTeam` walks `state.players` (derived from the
 * map with `[...teams].sort()`). Seat order is NOT the same thing once players
 * pick their own sides, and with three or more sides the two orders diverge
 * outright — a server pointer walking seats would hand the turn to a side whose
 * client isn't expecting it and the match would sit there.
 *
 * Team-less seats are dropped: nothing can be commanded without a side.
 */
const turnOrder = (seats: Awaited<ReturnType<typeof roster>>, surrendered: Set<number>) =>
	seats
		.filter((m): m is (typeof seats)[number] & { team: number } => m.team != null)
		.filter((m) => !surrendered.has(m.team))
		.sort((a, b) => a.team - b.team)

/**
 * The next still-in member after side `fromTeam`: the lowest team above it, or
 * back round to the lowest of all. This is `nextActiveTeam`'s rule verbatim.
 *
 * Keyed on the TEAM, never on the member's position in the eligible list —
 * because the side we're rotating away from is often no longer in it (it just
 * surrendered, or timed out). Walking the filtered list instead would restart
 * from its head, i.e. hand the turn to the lowest surviving side rather than the
 * one that genuinely comes next, and every client would refuse to agree.
 */
const nextInTurnOrder = (
	seats: Awaited<ReturnType<typeof roster>>,
	fromTeam: number | null,
	surrendered: Set<number>
) => {
	const ordered = turnOrder(seats, surrendered)
	if (ordered.length === 0) return null
	if (fromTeam == null) return ordered[0]
	return ordered.find((m) => m.team > fromTeam) ?? ordered[0]
}

/** The next still-in member after `fromUserSession` in TEAM rotation order,
 * excluding `fromUserSession` itself unless they are all that's left. */
const nextActiveAfter = (
	seats: Awaited<ReturnType<typeof roster>>,
	fromUserSession: string,
	surrendered: Set<number>
) => {
	const from = seats.find((m) => m.userSession === fromUserSession)
	const next = nextInTurnOrder(seats, from?.team ?? null, surrendered)
	if (next && next.userSession === fromUserSession) {
		// Only themselves left in the rotation — nobody to hand to.
		return turnOrder(seats, surrendered).length > 1 ? null : next
	}
	return next
}

/**
 * Hand the turn on after an end-turn, and return whoever now holds it.
 *
 * The server's pointer is a permission check, not a simulation: it has to land
 * on the same side the ENGINE just advanced to, or that side's client sees a
 * turn it is allowed to play while the server refuses every action from it (or,
 * worse, nobody's client is on that side at all and the match stalls forever).
 * Two things keep the two in step:
 *
 *  - `claimedNextTeam` is the team the ending client's own engine advanced to,
 *    carried on the `end-turn` action. It is the only way the server can know
 *    about a side ELIMINATED IN COMBAT — the engine skips a team with `hasLost`,
 *    but nothing about that reaches the event log, so a team-order rotation
 *    here would hand the turn to a dead player and deadlock a 3+ side match.
 *    Honoured only when it names a member who is still in, and never when it
 *    names the actor's own side while somebody else is still playing (which is
 *    what a client claiming an extra turn for itself would look like).
 *  - Failing that, plain team-ascending rotation, skipping surrendered sides.
 */
async function advanceTurn(
	session: string,
	actorUserSession: string,
	claimedNextTeam?: number | null
): Promise<{ userSession: string; userAuth: string | null; team: number } | null> {
	const { seats, surrendered } = await standing(session)
	const ordered = turnOrder(seats, surrendered)
	if (ordered.length === 0) return null

	const claimed =
		claimedNextTeam == null ? null : (ordered.find((m) => m.team === claimedNextTeam) ?? null)
	const next =
		claimed && (claimed.userSession !== actorUserSession || ordered.length === 1)
			? claimed
			: nextActiveAfter(seats, actorUserSession, surrendered)
	if (!next) return null

	await setCurrentTurn(session, next.userSession)
	return { userSession: next.userSession, userAuth: next.userAuth, team: next.team }
}

/** Re-arm the turn clock after an end-turn: the next player gets the room's
 * full per-turn allowance, and the room's TTL follows the new deadline. */
async function resetTurnDeadline(session: string, roomIn?: RoomRow | null): Promise<number | null> {
	const room = roomIn ?? (await getRoom(session))
	if (!isAsyncRoom(room)) return null
	const turn_deadline = now() + clampAsyncTimeout(room.turn_timeout_ms)
	await db.update(
		'game_room',
		{ session },
		{ turn_deadline, expires_at: turn_deadline + ASYNC_ROOM_GRACE_MS }
	)
	return turn_deadline
}

/** The match resolved (result recorded): stop the clock, keep the room around
 * long enough for both players to see the result and rematch. */
async function finishAsyncRoom(session: string): Promise<void> {
	const room = await getRoom(session)
	if (!isAsyncRoom(room)) return
	await db.update(
		'game_room',
		{ session },
		{ turn_deadline: null, expires_at: now() + ASYNC_FINISHED_TTL_MS }
	)
}

/**
 * The async auto-resign: if the current player's turn deadline has passed,
 * record a surrender on their behalf and hand the turn (with a fresh clock) to
 * the next player still in the game.
 *
 * Called lazily from the hot game endpoints (move / events / heartbeat) and by
 * the hourly cron, so it must be safe under concurrency: the conditional
 * update on `turn_deadline` is the claim — whichever enforcer flips it off its
 * old value proceeds, everyone else sees count 0 and backs off. Returns what
 * happened so callers can notify the players, or null when there was nothing
 * to enforce (or another enforcer got there first).
 */
async function enforceTurnDeadline(
	session: string,
	roomIn?: RoomRow | null
): Promise<AsyncResignResult | null> {
	const room = roomIn ?? (await getRoom(session))
	if (!isAsyncRoom(room) || !hasStarted(room)) return null
	const deadline = room.turn_deadline == null ? null : Number(room.turn_deadline)
	if (deadline == null || now() < deadline) return null

	// A recorded match means the game already resolved through normal play;
	// the leftover clock is stale, so drop it instead of resigning anyone.
	if (await matchRecorded(session)) {
		await db.update('game_room', { session }, { turn_deadline: null })
		return null
	}

	const { seats, surrendered } = await standing(session)
	const member = seats.find((m) => m.userSession === room.current_turn)
	if (!member || member.team == null || surrendered.has(member.team)) {
		// Nothing enforceable: the member left (their resign was recorded on the
		// way out) or never had a side. Clear the clock so this stops refiring.
		await db.update('game_room', { session }, { turn_deadline: null })
		return null
	}

	const stillIn = new Set(surrendered)
	stillIn.add(member.team)
	const next = nextActiveAfter(seats, member.userSession, stillIn)
	const survivors = seats.filter(
		(m) => m.userSession !== member.userSession && m.team != null && !surrendered.has(m.team)
	)
	const gameOver = survivors.length <= 1
	const turn_deadline = gameOver ? null : now() + clampAsyncTimeout(room.turn_timeout_ms)

	const { count } = await db.update(
		'game_room',
		{ session, turn_deadline: deadline },
		{
			turn_deadline,
			current_turn: next?.userSession ?? member.userSession,
			expires_at: (turn_deadline ?? now()) + ASYNC_ROOM_GRACE_MS,
		}
	)
	if (count === 0) return null

	const event = await appendEvent(session, member.userSession, {
		kind: 'surrender',
		team: member.team,
	})
	await realtime.tryPublish(`game:${session}`, { event })

	return {
		resigned: { userSession: member.userSession, userAuth: member.userAuth, team: member.team },
		next: next ? { userSession: next.userSession, userAuth: next.userAuth, team: next.team } : null,
		gameOver,
		eventId: event.id,
		turnDeadline: turn_deadline,
	}
}

/**
 * Settle the room's turn pointer and clock after a surrender already sits in
 * the event log (a manual in-game resign, or a resign-on-leave). Without this,
 * an async room whose CURRENT player surrendered would keep ticking toward an
 * unenforceable deadline while the offline opponent never learns the game
 * ended. Returns who plays next and whether the match is decided, or null when
 * the room isn't a started async game.
 */
async function settleAsyncAfterSurrender(
	session: string,
	resignedUserSession: string,
	roomIn?: RoomRow | null
): Promise<{
	next: { userSession: string; userAuth: string | null; team: number | null } | null
	gameOver: boolean
} | null> {
	const room = roomIn ?? (await getRoom(session))
	if (!isAsyncRoom(room) || !hasStarted(room)) return null

	// The fresh surrender is already in the log, so it is in `surrendered` here.
	const { seats, surrendered } = await standing(session)
	const next = nextActiveAfter(seats, resignedUserSession, surrendered)
	const survivors = seats.filter((m) => m.team != null && !surrendered.has(m.team))
	const gameOver = survivors.length <= 1

	const patch: Record<string, unknown> = gameOver
		? { turn_deadline: null, expires_at: now() + ASYNC_FINISHED_TTL_MS }
		: {}
	// Only hand the turn over when the resignee held it (or the game is decided);
	// an off-turn surrender must not steal the current player's turn.
	if (next && (gameOver || room.current_turn === resignedUserSession)) {
		patch.current_turn = next.userSession
		if (!gameOver) {
			const turn_deadline = now() + clampAsyncTimeout(room.turn_timeout_ms)
			patch.turn_deadline = turn_deadline
			patch.expires_at = turn_deadline + ASYNC_ROOM_GRACE_MS
		}
	}
	if (Object.keys(patch).length) await db.update('game_room', { session }, patch)

	return {
		next: next ? { userSession: next.userSession, userAuth: next.userAuth, team: next.team } : null,
		gameOver,
	}
}

/**
 * A player explicitly leaving a STARTED async game resigns it on the way out.
 * Without this, leaving would delete their seat and the deadline enforcement
 * would have no team to resign — the opponent's game could never resolve.
 * Live rooms don't need it (the heartbeat sweep resigns absentees). Returns
 * the recorded surrender's settlement, or null if there was nothing to resign.
 */
async function resignAsyncMember(
	session: string,
	userSession: string
): Promise<{
	eventId: number
	team: number
	userAuth: string | null
	next: { userSession: string; userAuth: string | null; team: number | null } | null
	gameOver: boolean
} | null> {
	const room = await getRoom(session)
	if (!isAsyncRoom(room) || !hasStarted(room)) return null
	if (await matchRecorded(session)) return null

	const { seats, surrendered } = await standing(session)
	const member = seats.find((m) => m.userSession === userSession)
	if (!member || member.team == null || surrendered.has(member.team)) return null

	const event = await appendEvent(session, userSession, {
		kind: 'surrender',
		team: member.team,
	})
	await realtime.tryPublish(`game:${session}`, { event })

	const settled = await settleAsyncAfterSurrender(session, userSession, room)
	return {
		eventId: event.id,
		team: member.team,
		userAuth: member.userAuth,
		next: settled?.next ?? null,
		gameOver: settled?.gameOver ?? true,
	}
}

export type AsyncGameSummary = {
	session: string
	mapId: string
	started: boolean
	yourTurn: boolean
	turnDeadline: number | null
	turnTimeoutMs: number
	opponentAuth: string | null
}

/**
 * Every unresolved async game this player has a seat in — the "your async
 * games" list. Unlike live play (one pointer in `player_game`), a player can
 * have many async games running at once; this enumerates them via their
 * `game_member` rows. Games whose match was recorded are omitted.
 */
async function listMyAsyncGames(userSession: string): Promise<AsyncGameSummary[]> {
	const memberships = await db.find<{ session: string }>('game_member', {
		where: { user_session: userSession },
		select: ['session'],
	})
	if (memberships.length === 0) return []
	const sessions = [...new Set(memberships.map((m) => m.session))]

	const rooms = (
		await db.find<RoomRow>('game_room', {
			where: { session: { in: sessions }, mode: 'async' },
		})
	).filter((r) => !expired(r.expires_at))
	if (rooms.length === 0) return []
	const roomSessions = rooms.map((r) => r.session)

	// One pass for opponents and one for resolved matches, across all rooms.
	const [allSeats, recorded] = await Promise.all([
		db.find<MemberRow & { session: string }>('game_member', {
			where: { session: { in: roomSessions } },
			orderBy: { seat: 'asc' },
			select: ['session', 'user_session', 'seat', 'user_auth'],
		}),
		db.find<{ session_id: string }>('matches', {
			where: { session_id: { in: roomSessions } },
			select: ['session_id'],
		}),
	])
	const finished = new Set(recorded.map((m) => m.session_id))
	const opponentBySession = new Map<string, string | null>()
	for (const seat of allSeats) {
		if (seat.user_session === userSession) continue
		if (!opponentBySession.has(seat.session)) {
			opponentBySession.set(seat.session, seat.user_auth ?? null)
		}
	}

	return rooms
		.filter((r) => !finished.has(r.session))
		.map((r) => ({
			session: r.session,
			mapId: r.map_id,
			started: hasStarted(r),
			yourTurn: hasStarted(r) && r.current_turn === userSession,
			turnDeadline: r.turn_deadline == null ? null : Number(r.turn_deadline),
			turnTimeoutMs: clampAsyncTimeout(r.turn_timeout_ms),
			opponentAuth: opponentBySession.get(r.session) ?? null,
		}))
		.sort((a, b) => {
			// Your-turn games first, then by soonest deadline.
			if (a.yourTurn !== b.yourTurn) return a.yourTurn ? -1 : 1
			return (a.turnDeadline ?? Infinity) - (b.turnDeadline ?? Infinity)
		})
}

/** Started async rooms whose current turn deadline has passed — the cron's
 * work list. Oldest deadline first; capped so one run stays bounded. */
async function expiredAsyncTurns(limit = 50): Promise<RoomRow[]> {
	const rows = await db.find<RoomRow>('game_room', {
		where: { mode: 'async', turn_deadline: { lt: now() } },
		orderBy: { turn_deadline: 'asc' },
		limit,
	})
	return rows.filter((r) => !expired(r.expires_at) && hasStarted(r))
}

export const gameStore = {
	members,
	roster,
	teamOf,
	setMemberTeam,
	assignTeamsIfNeeded,
	isMember,
	getRoom,
	currentGame,
	setPlayerGame,
	clearPlayerGame,
	leaveGame,
	createRoom,
	addMember,
	removeMember,
	ensureMember,
	rematchRoom,
	addAiMember,
	isAiMember,
	aiDriver,
	setLockRandom,
	memberCount,
	fillWithAi,
	advanceTurn,
	listPublicRooms,
	setPublic,
	touchMember,
	staleMembers,
	sweepAbsent,
	seatOf,
	armStartCountdown,
	startNow,
	disarmCountdown,
	setMemberReady,
	clearReady,
	readyState,
	canStart,
	seedFirstTurn,
	currentTurn,
	setCurrentTurn,
	appendEvent,
	nextClientSeq,
	events,
	appendLog,
	readLog,
	matchRecorded,
	resetTurnDeadline,
	finishAsyncRoom,
	enforceTurnDeadline,
	settleAsyncAfterSurrender,
	resignAsyncMember,
	listMyAsyncGames,
	expiredAsyncTurns,
}
