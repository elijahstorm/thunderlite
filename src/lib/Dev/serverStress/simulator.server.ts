/**
 * Server stress test: N online matches, played against the real game routes by
 * virtual players, paced like a match that actually happened.
 *
 * The question this answers is the only one that matters for scale: how many
 * rooms like this fit under the gateway's per-minute budgets at once. Nothing
 * here simulates the game. The virtual players send actions with the timing,
 * batch shape and turn structure of match 24 (see `matchScript.ts`), poll,
 * heartbeat and flush a trace the way `GameSocket` does, and the server does
 * exactly what it would do for real clients, because they ARE requests to the
 * real routes on this same origin. Every gateway call lands in the ledger,
 * attributed to the route that made it, and every `RateLimit-*` header the
 * gateway sends back lands in `rateLimit.ts`. This module only adds the players.
 *
 * Why HTTP and not the store directly: attribution. The ledger keys spend by the
 * route inside whose request it happened. A call made from this module outside
 * any request would be unattributed, and the whole point is to see which route
 * is spending what. The one exception is the roster read after a room starts,
 * which the simulator needs for its own bookkeeping (teams, who is the CPU) and
 * a real client learns from the page load it is about to do anyway.
 *
 * Dev only, by construction: the virtual players sign in with the `x-stress-user`
 * header that `hooks.server.ts` honours only in dev. Pointed at production via
 * `DONTCODE_API_URL`, this spends the production budget, which is the point of
 * running it and the reason it is not reachable from a deployed build.
 */
import { gameStore } from '$lib/Game/store.server'
import { db } from '$lib/dontcode/server'
import { ledgerWindow } from '$lib/Security/gatewayLedger'
import {
	budgetSnapshot,
	GATEWAY_BUDGET_PER_MINUTE,
	type GatewayScope,
} from '$lib/Security/rateLimit'
import { MATCH_24_SCRIPT, type ScriptRelay } from './matchScript'

export type StressOptions = {
	/** Rooms kept alive at once. */
	matches: number
	/** Time compression. 2 plays a 22-minute match in 11 and loads the gateway like twice the rooms. */
	speed: number
	/** Gap between room starts, so N rooms do not all create, start and settle in the same second. */
	staggerMs: number
	/** A playable map. Rooms take their seat count from it; the script wants four sides. */
	mapId: string
	/** Event poll cadence per client. 30s is the socket-trusted cadence; 1.5s is the untrusted one. */
	pollIntervalMs: number
	/**
	 * Presence check cadence per client, applied only after the room has been
	 * quiet that long, as the real client does. 0 disables it, and 0 is the
	 * honest default here: virtual players hold no socket, so a presence check
	 * would find nobody and resign the turn holder. A healthy room never asks.
	 */
	stallCheckMs: number
	/** POST a result when the script ends, so settlement writes are counted too. */
	settle: boolean
	/** Start a fresh room when one finishes, holding the room count steady. */
	loop: boolean
	/**
	 * Relay a whole turn in one request at the handover, as the client now does,
	 * rather than each of the script's action bursts as it happened. Off replays
	 * the pre-change shape for comparison.
	 */
	relayPerTurn: boolean
}

export const DEFAULT_STRESS_OPTIONS: StressOptions = {
	matches: 4,
	speed: 1,
	staggerMs: 2000,
	mapId: '',
	pollIntervalMs: 30_000,
	stallCheckMs: 0,
	settle: true,
	loop: true,
	relayPerTurn: true,
}

type RouteAcc = {
	count: number
	ok: number
	s403: number
	s429: number
	s5xx: number
	other: number
	/** Bounded sample of latencies for percentiles. */
	ms: number[]
	/** Timestamps of recent requests, for a rolling per-minute rate. */
	recent: number[]
}

type StressError = { at: number; room: string; route: string; status: number; message: string }

type Seat = { userSession: string; seat: number; team: number | null; isAi: boolean }

type Room = {
	index: number
	session: string
	host: Player
	guest: Player
	seats: Seat[]
	/** Whose turn the simulator believes it is, kept in step with the server's pointer. */
	current: string | null
	surrendered: Set<string>
	/** Events relayed since the last trace flush, per client. */
	pendingTrace: Map<string, number>
	/** Last relay or received event, for the stall check. */
	lastActivityAt: number
	timers: ReturnType<typeof setInterval>[]
	state: 'starting' | 'live' | 'finished' | 'failed'
}

type Player = {
	user: string
	clientSeq: number
	lastEventId: number
	firstPoll: boolean
}

type Run = {
	id: string
	origin: string
	options: StressOptions
	startedAt: number
	state: 'running' | 'stopping' | 'done'
	rooms: Room[]
	nextRoomIndex: number
	routes: Map<string, RouteAcc>
	errors: StressError[]
	refusals: { notYourTurn: number; rateLimited: number; other: number }
	sessions: string[]
	stop: boolean
}

const MAX_LATENCY_SAMPLES = 500
const MAX_ERRORS = 30
const RATE_WINDOW_MS = 60_000
/** Mirrors `RELAY_BUSY_ATTEMPTS` / `MAX_BUSY_WAIT_MS` in GameSocket. */
const BUSY_ATTEMPTS = 6
const MAX_BUSY_WAIT_MS = 20_000

let run: Run | null = null
/** Sessions from earlier runs this process has not cleaned up yet. */
let leftover: string[] = []

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// ── Requests ─────────────────────────────────────────────────────────────────

const accFor = (r: Run, route: string): RouteAcc => {
	let acc = r.routes.get(route)
	if (!acc) {
		acc = { count: 0, ok: 0, s403: 0, s429: 0, s5xx: 0, other: 0, ms: [], recent: [] }
		r.routes.set(route, acc)
	}
	return acc
}

const record = (r: Run, route: string, status: number, ms: number) => {
	const acc = accFor(r, route)
	acc.count += 1
	if (status >= 200 && status < 300) acc.ok += 1
	else if (status === 403) acc.s403 += 1
	else if (status === 429) acc.s429 += 1
	else if (status >= 500) acc.s5xx += 1
	else acc.other += 1
	acc.ms.push(ms)
	if (acc.ms.length > MAX_LATENCY_SAMPLES) acc.ms.splice(0, acc.ms.length - MAX_LATENCY_SAMPLES)
	const now = Date.now()
	acc.recent.push(now)
	const cutoff = now - RATE_WINDOW_MS
	while (acc.recent.length && acc.recent[0] < cutoff) acc.recent.shift()
}

const noteError = (r: Run, room: string, route: string, status: number, message: string) => {
	r.errors.push({ at: Date.now(), room, route, status, message: message.slice(0, 160) })
	if (r.errors.length > MAX_ERRORS) r.errors.splice(0, r.errors.length - MAX_ERRORS)
}

type Reply = { status: number; body: Record<string, unknown> | null }

/**
 * One request as a virtual player. `route` is the ledger-style label the stats
 * are keyed by, so the table on the page lines up with `/dev/lag`.
 */
const call = async (
	r: Run,
	room: string,
	user: string,
	route: string,
	path: string,
	init: { method?: string; body?: unknown } = {}
): Promise<Reply> => {
	const started = performance.now()
	// Assigned on both paths below; the initializer only satisfies `finally`.
	// eslint-disable-next-line no-useless-assignment
	let status = 0
	let body: Record<string, unknown> | null = null
	try {
		const res = await fetch(`${r.origin}${path}`, {
			method: init.method ?? 'GET',
			headers: {
				'x-stress-user': user,
				...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
			},
			body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
		})
		status = res.status
		const text = await res.text()
		try {
			body = text ? (JSON.parse(text) as Record<string, unknown>) : null
		} catch {
			body = null
		}
	} catch (err) {
		status = 0
		noteError(r, room, route, 0, err instanceof Error ? err.message : 'fetch failed')
	} finally {
		record(r, route, status, Math.round(performance.now() - started))
	}
	if (status === 429) r.refusals.rateLimited += 1
	if (status >= 400 && status !== 429) {
		const message = (body?.message as string | undefined) ?? `${status}`
		if (status === 403 && /not your turn/i.test(message)) r.refusals.notYourTurn += 1
		else r.refusals.other += 1
		noteError(r, room, route, status, message)
	}
	return { status, body }
}

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * A valid action of the given kind. Tiles are arbitrary: the server stores
 * actions, it never applies them, so the cost of a `move` is the cost of a row
 * whatever its coordinates. `n` just keeps consecutive actions from being
 * byte-identical.
 */
const synthesize = (kind: string, n: number): Record<string, unknown> | null => {
	const tile = (n * 7) % 400
	switch (kind) {
		case 'move':
			return { kind, from: tile, to: tile + 1 }
		case 'attack':
			return { kind, from: tile, to: tile + 1 }
		case 'wait':
		case 'repair':
		case 'capture':
			return { kind, tile }
		case 'build':
			return { kind, building: tile, unitType: n % 6 }
		case 'transport-unload':
			return { kind, transport: tile, tile: tile + 1 }
		case 'transport-load':
			return { kind, transport: tile, passenger: tile + 1 }
		default:
			return null
	}
}

/** Team-ascending rotation over the seats still in, the server's own fallback. */
const nextAfter = (room: Room, from: string | null): Seat | null => {
	const active = room.seats
		.filter((s) => s.team != null && !room.surrendered.has(s.userSession))
		.sort((a, b) => (a.team as number) - (b.team as number))
	if (active.length === 0) return null
	const idx = active.findIndex((s) => s.userSession === from)
	return active[(idx + 1) % active.length] ?? active[0]
}

const seatOf = (room: Room, user: string | null) =>
	room.seats.find((s) => s.userSession === user) ?? null

// ── A room's life ────────────────────────────────────────────────────────────

const parseRelay = ([offset, sender, actions]: ScriptRelay) => ({
	offset,
	sender,
	kinds: actions.split(',').map((a) => a.split(':')[1]),
})

type Relay = ReturnType<typeof parseRelay>

/**
 * The script as the server will see it. Per turn, consecutive rows from the same
 * sender fold into one relay that lands when the turn's last action did, capped
 * at the run size the route accepts; a surrender always travels alone. Off, the
 * script's own bursts are replayed as they happened.
 */
const scriptRelays = (perTurn: boolean): Relay[] => {
	const rows = MATCH_24_SCRIPT.map(parseRelay)
	if (!perTurn) return rows
	const out: Relay[] = []
	let open: Relay | null = null
	for (const row of rows) {
		const alone = row.kinds.length === 1 && row.kinds[0] === 'surrender'
		if (
			open &&
			(alone || open.sender !== row.sender || open.kinds.length + row.kinds.length > 64)
		) {
			out.push(open)
			open = null
		}
		if (alone) {
			out.push(row)
			continue
		}
		open = open
			? { offset: row.offset, sender: open.sender, kinds: [...open.kinds, ...row.kinds] }
			: { ...row, kinds: [...row.kinds] }
		if (row.kinds[row.kinds.length - 1] === 'end-turn') {
			out.push(open)
			open = null
		}
	}
	if (open) out.push(open)
	return out
}

/**
 * Create, fill and start a room, then load it the way two browsers would: the
 * `/play` loader is where teams get assigned and the first turn seeded, and a
 * real match pays for that too.
 */
const openRoom = async (r: Run, index: number): Promise<Room | null> => {
	const tag = `stress-${r.id}-${index}`
	const host: Player = { user: `${tag}-h`, clientSeq: 0, lastEventId: -1, firstPoll: true }
	const guest: Player = { user: `${tag}-g`, clientSeq: 0, lastEventId: -1, firstPoll: true }

	const created = await call(r, tag, host.user, '/api/game', '/api/game', {
		method: 'POST',
		body: { mapId: r.options.mapId },
	})
	const session = created.body?.session as string | undefined
	if (created.status !== 200 || !session) return null
	r.sessions.push(session)

	const room: Room = {
		index,
		session,
		host,
		guest,
		seats: [],
		current: null,
		surrendered: new Set(),
		pendingTrace: new Map(),
		lastActivityAt: Date.now(),
		timers: [],
		state: 'starting',
	}
	r.rooms.push(room)
	const base = `/api/game/${session}`
	const ok = (reply: Reply) => reply.status >= 200 && reply.status < 300

	if (
		!ok(
			await call(r, session, guest.user, '/api/game/join', '/api/game/join', {
				method: 'POST',
				body: { session },
			})
		)
	)
		return fail(r, room)
	for (const p of [host, guest]) {
		const ready = await call(r, session, p.user, '/api/game/[session]/lobby', `${base}/lobby`, {
			method: 'POST',
			body: { action: 'ready', ready: true },
		})
		if (!ok(ready)) return fail(r, room)
	}
	if (
		!ok(
			await call(r, session, host.user, '/api/game/[session]/start', `${base}/start`, {
				method: 'POST',
			})
		)
	)
		return fail(r, room)
	// Both browsers land on /play. That load assigns teams, seeds the first turn
	// and reads the roster, and it is real per-match cost.
	for (const p of [host, guest]) {
		await call(r, session, p.user, '/(app)/play', '/play')
	}

	const roster = await gameStore.roster(session)
	room.seats = roster.map((s) => ({
		userSession: s.userSession,
		seat: s.seat,
		team: s.team,
		isAi: s.isAi,
	}))
	// The engine's first side is the lowest team, which is what `seedFirstTurn`
	// pointed the room at during the /play load above.
	const first = [...room.seats]
		.filter((s) => s.team != null)
		.sort((a, b) => (a.team as number) - (b.team as number))[0]
	room.current = first?.userSession ?? host.user
	room.state = 'live'
	return room
}

const fail = (_r: Run, room: Room): null => {
	room.state = 'failed'
	return null
}

/**
 * Play the script into a live room. Each script row is one relay: it belongs to
 * the guest while the guest is still in and holds the turn, otherwise to the
 * host, who also drives every CPU seat. Whose turn it is comes from the room the
 * simulator actually created, not from the script's seat tags, so the rotation
 * the server enforces is the one the simulator steers with `next`.
 */
const playRoom = async (r: Run, room: Room) => {
	const scale = 1 / Math.max(0.05, r.options.speed)
	const base = `/api/game/${room.session}`
	const startedAt = Date.now()

	// Cadence timers per client. Both clients stay for the whole match, as the
	// spectating guest did in match 24.
	const each = (fn: (p: Player) => void, ms: number) => {
		for (const p of [room.host, room.guest]) {
			room.timers.push(setInterval(() => void fn(p), Math.max(250, ms * scale)))
		}
	}
	each((p) => {
		const since = p.lastEventId
		// The first poll asks for the sender's counter and takes the full path,
		// as a browser does on load; every later one is a trusted-socket
		// reconciliation pass that asks the cache cursor first.
		const seq = p.firstPoll ? '&seq=1' : '&cursor=1'
		p.firstPoll = false
		void call(
			r,
			room.session,
			p.user,
			'/api/game/[session]/events',
			`${base}/events?since=${since}${seq}`
		).then((reply) => {
			const last = reply.body?.lastEventId
			if (typeof last === 'number') p.lastEventId = Math.max(p.lastEventId, last)
			const events = reply.body?.events
			if (Array.isArray(events) && events.length)
				room.pendingTrace.set(p.user, (room.pendingTrace.get(p.user) ?? 0) + events.length)
		})
	}, r.options.pollIntervalMs)
	if (r.options.stallCheckMs > 0) {
		each((p) => {
			if (Date.now() - room.lastActivityAt < r.options.stallCheckMs * scale) return
			room.lastActivityAt = Date.now()
			void call(r, room.session, p.user, '/api/game/[session]/heartbeat', `${base}/heartbeat`, {
				method: 'POST',
			})
		}, r.options.stallCheckMs / 3)
	}

	let n = room.index * 1000
	for (const row of scriptRelays(r.options.relayPerTurn)) {
		if (r.stop) break
		const due = startedAt + row.offset * scale
		const wait = due - Date.now()
		if (wait > 0) await sleep(wait)
		if (r.stop) break

		// Who acts: the seat the turn is on. Who sends: that seat if human, else
		// the host as CPU driver. A script row tagged for the guest after the guest
		// has surrendered is the host's, which is what the real match did too.
		const currentSeat = seatOf(room, room.current)
		if (!currentSeat) break
		const guestActs =
			currentSeat.userSession === room.guest.user && !room.surrendered.has(room.guest.user)
		const sender = guestActs ? room.guest : room.host
		if (!guestActs && !currentSeat.isAi && currentSeat.userSession !== room.host.user) {
			// The turn is on the guest but the guest quit: the server will have
			// rotated past them; catch our pointer up.
			room.current = nextAfter(room, room.current)?.userSession ?? room.current
			continue
		}

		const isSurrender = row.kinds.length === 1 && row.kinds[0] === 'surrender'
		let actions: Record<string, unknown>[]
		let handsOver = false
		if (isSurrender) {
			// The script's surrender is the guest's. If the guest already went, the
			// row is just an ordinary wait from the host.
			if (room.surrendered.has(room.guest.user) || !seatOf(room, room.guest.user)) {
				actions = [synthesize('wait', n++) as Record<string, unknown>]
			} else {
				const guestSeat = seatOf(room, room.guest.user)
				actions = [{ kind: 'surrender', team: guestSeat?.team ?? 0 }]
			}
		} else {
			actions = []
			for (const kind of row.kinds) {
				if (kind === 'end-turn') {
					const next = nextAfter(room, room.current)
					actions.push({ kind: 'end-turn', next: next?.team ?? 0 })
					handsOver = true
				} else {
					const a = synthesize(kind, n++)
					if (a) actions.push(a)
				}
			}
			if (actions.length === 0) continue
		}

		const surrenderBy = isSurrender && !room.surrendered.has(room.guest.user) ? room.guest : sender
		const who = isSurrender ? surrenderBy : sender
		const status = await relay(r, room, who, `${base}/move`, actions)
		if (status >= 200 && status < 300) {
			who.clientSeq += actions.length
			room.lastActivityAt = Date.now()
			room.pendingTrace.set(who.user, (room.pendingTrace.get(who.user) ?? 0) + actions.length)
			if (isSurrender && who === room.guest) {
				room.surrendered.add(room.guest.user)
				if (room.current === room.guest.user)
					room.current = nextAfter(room, room.current)?.userSession ?? null
			} else if (handsOver) {
				room.current = nextAfter(room, room.current)?.userSession ?? null
			}
		} else if (status === 403) {
			// Our pointer and the server's disagree. Rotate and carry on; the
			// refusal is counted, and a run full of them says the model is wrong.
			room.current = nextAfter(room, room.current)?.userSession ?? null
		}
	}

	for (const t of room.timers) clearInterval(t)
	room.timers = []

	// The recorder ships its whole trace once, at game over: one private-storage
	// upload per client. A healthy match writes nothing to game_log any more, so
	// this and the result are all a finished room costs. The body is a fraction
	// of a real archive (match 24 was ~400KB per client); the gateway meters
	// calls, and the call is what is being counted.
	if (!r.stop) {
		const actions = room.pendingTrace.get(room.host.user) ?? 0
		const entries = Array.from({ length: Math.min(600, Math.max(60, actions * 3)) }, (_, i) => ({
			kind: i % 3 === 0 ? 'in' : i % 3 === 1 ? 'state' : 'perf',
			eventId: i,
			ts: startedAt + i * 1000,
			detail: { digest: 'stress', via: 'push', disposition: 'applied', what: 'gauge' },
		}))
		for (const p of [room.host, room.guest]) {
			await call(r, room.session, p.user, '/api/game/[session]/trace', `${base}/trace`, {
				method: 'POST',
				body: { entries },
			})
		}
	}

	if (!r.stop && r.options.settle) {
		const hostTeam = seatOf(room, room.host.user)?.team ?? 0
		const guestTeam = seatOf(room, room.guest.user)?.team ?? 1
		const turns = 22
		await call(r, room.session, room.host.user, '/api/game/[session]/result', `${base}/result`, {
			method: 'POST',
			body: { mode: 'online', team: hostTeam, winner: hostTeam, turns },
		})
		await call(r, room.session, room.guest.user, '/api/game/[session]/result', `${base}/result`, {
			method: 'POST',
			body: { mode: 'online', team: guestTeam, winner: hostTeam, turns },
		})
	}
	room.state = 'finished'
}

/**
 * One relay with the client's own back-off on a rate limit: honour the server's
 * `retryAfter`, capped, for a bounded number of attempts. Anything else is
 * reported once and the action is dropped, as the real client would freeze.
 */
const relay = async (
	r: Run,
	room: Room,
	who: Player,
	path: string,
	actions: Record<string, unknown>[]
): Promise<number> => {
	for (let attempt = 1; attempt <= BUSY_ATTEMPTS; attempt++) {
		if (r.stop) return 0
		const reply = await call(r, room.session, who.user, '/api/game/[session]/move', path, {
			method: 'POST',
			body: { events: actions, clientSeq: who.clientSeq },
		})
		if (reply.status !== 429) return reply.status
		const seconds = Number(reply.body?.retryAfter)
		const wait = Math.min(
			MAX_BUSY_WAIT_MS,
			(Number.isFinite(seconds) && seconds > 0 ? seconds : 2) * 1000
		)
		await sleep(wait)
	}
	return 429
}

/** Open, play and (if looping) replace a room, until the run stops. */
const roomLoop = async (r: Run, index: number) => {
	let current = index
	while (!r.stop) {
		const room = await openRoom(r, current)
		if (!room) {
			if (!r.options.loop) return
			await sleep(5000)
			current = r.nextRoomIndex++
			continue
		}
		try {
			await playRoom(r, room)
		} catch (err) {
			room.state = 'failed'
			noteError(r, room.session, 'room', 0, err instanceof Error ? err.message : 'room failed')
			for (const t of room.timers) clearInterval(t)
		}
		if (!r.options.loop || r.stop) return
		current = r.nextRoomIndex++
	}
}

// ── Public surface ───────────────────────────────────────────────────────────

export const startStressRun = (partial: Partial<StressOptions>, origin: string) => {
	if (run && run.state === 'running') return stressSnapshot()
	if (run) leftover.push(...run.sessions)
	const options: StressOptions = { ...DEFAULT_STRESS_OPTIONS, ...partial }
	options.matches = Math.max(1, Math.min(400, Math.floor(options.matches)))
	options.speed = Math.max(0.25, Math.min(16, options.speed))
	const r: Run = {
		id: Math.random().toString(36).slice(2, 8),
		origin,
		options,
		startedAt: Date.now(),
		state: 'running',
		rooms: [],
		nextRoomIndex: options.matches,
		routes: new Map(),
		errors: [],
		refusals: { notYourTurn: 0, rateLimited: 0, other: 0 },
		sessions: [],
		stop: false,
	}
	run = r
	void (async () => {
		const loops: Promise<void>[] = []
		for (let i = 0; i < options.matches && !r.stop; i++) {
			loops.push(roomLoop(r, i))
			if (options.staggerMs > 0) await sleep(options.staggerMs / Math.max(0.25, options.speed))
		}
		await Promise.allSettled(loops)
		r.state = 'done'
	})()
	return stressSnapshot()
}

export const stopStressRun = () => {
	if (!run) return
	run.stop = true
	if (run.state === 'running') run.state = 'stopping'
	for (const room of run.rooms) {
		for (const t of room.timers) clearInterval(t)
		room.timers = []
	}
}

const percentile = (sorted: number[], p: number) =>
	sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0

export const stressSnapshot = () => {
	const window = ledgerWindow()
	const budgets = budgetSnapshot()
	const scopes = Object.entries(window.perMinuteByScope).map(([scope, perMinute]) => {
		const budget = budgets[scope]?.limit ?? GATEWAY_BUDGET_PER_MINUTE[scope as GatewayScope] ?? null
		return {
			scope,
			perMinute,
			budget,
			share: budget ? Number((perMinute / budget).toFixed(3)) : null,
			remaining: budgets[scope]?.remaining ?? null,
			cooldownSeconds: budgets[scope]?.cooldownSeconds ?? 0,
		}
	})
	const r = run
	const byRoute = r
		? [...r.routes.entries()]
				.map(([route, acc]) => {
					const sorted = [...acc.ms].sort((a, b) => a - b)
					return {
						route,
						count: acc.count,
						ok: acc.ok,
						s403: acc.s403,
						s429: acc.s429,
						s5xx: acc.s5xx,
						other: acc.other,
						p50: percentile(sorted, 0.5),
						p95: percentile(sorted, 0.95),
						max: sorted.length ? sorted[sorted.length - 1] : 0,
					}
				})
				.sort((a, b) => b.count - a.count)
		: []
	const perMinute = r ? [...r.routes.values()].reduce((n, acc) => n + acc.recent.length, 0) : 0
	const rooms = { planned: r?.options.matches ?? 0, starting: 0, live: 0, finished: 0, failed: 0 }
	for (const room of r?.rooms ?? []) rooms[room.state] += 1
	return {
		state: r ? r.state : ('idle' as const),
		runId: r?.id ?? null,
		startedAt: r?.startedAt ?? null,
		elapsedMs: r ? Date.now() - r.startedAt : 0,
		options: r?.options ?? DEFAULT_STRESS_OPTIONS,
		rooms,
		effectiveConcurrency: r ? rooms.live * r.options.speed : 0,
		requests: {
			total: r ? [...r.routes.values()].reduce((n, acc) => n + acc.count, 0) : 0,
			perMinute,
			byRoute,
		},
		refusals: r?.refusals ?? { notYourTurn: 0, rateLimited: 0, other: 0 },
		ledger: { seconds: window.seconds, callsPerMinute: window.callsPerMinute, scopes },
		errors: r ? [...r.errors].reverse() : [],
		sessions: [...(r?.sessions ?? []), ...leftover],
	}
}

/**
 * Delete every row the runs in this process created. Batched `in` deletes so
 * the cleanup itself is a few dozen writes, not one per room. Match rows come
 * first so their player rows can be found by id.
 */
export const cleanupStressRun = async (): Promise<{ deleted: Record<string, number> }> => {
	if (run && run.state === 'running') stopStressRun()
	const sessions = [...new Set([...(run?.sessions ?? []), ...leftover])]
	const deleted: Record<string, number> = {}
	const bump = (table: string, n: number) => (deleted[table] = (deleted[table] ?? 0) + n)
	const BATCH = 25
	for (let i = 0; i < sessions.length; i += BATCH) {
		const chunk = sessions.slice(i, i + BATCH)
		const matches = await db.find<{ id: number }>('matches', {
			where: { session_id: { in: chunk } },
			select: ['id'],
		})
		if (matches.length) {
			const ids = matches.map((m) => m.id)
			bump('match_players', (await db.delete('match_players', { match_id: { in: ids } })).count)
			bump('matches', (await db.delete('matches', { id: { in: ids } })).count)
		}
		for (const table of ['game_event', 'game_log', 'game_member', 'player_game', 'game_room']) {
			bump(table, (await db.delete(table, { session: { in: chunk } })).count)
		}
	}
	if (run) run.sessions = []
	leftover = []
	return { deleted }
}
