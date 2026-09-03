import { error, isHttpError, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gatewayCooldownSeconds, noteRateLimit } from '$lib/Security/rateLimit'
import { isValidSerializedAction } from '$lib/Engine/Interactor/serializedAction.js'
import type { GameEvent, SerializedAction } from '$lib/Engine/Interactor/serializedAction.js'
import { gameStore, OutOfOrderEventError, PartialAppendError } from '$lib/Game/store.server'
import { realtime } from '$lib/dontcode/server'
import {
	notifyAsyncResignation,
	notifyAsyncTimeout,
	notifyAsyncYourTurn,
} from '$lib/Game/asyncNotify.server'
import { clampAsyncTimeout } from '$lib/Game/asyncConfig'

/**
 * Ceiling on one relayed batch.
 *
 * A batch is one player's own consecutive actions, so the natural size is "a
 * turn" — a CPU side moving a dozen units, or a human's burst before ending.
 * The cap is a fence against a client that has lost the plot, not a tuning
 * knob: the client re-sends whatever doesn't fit as the next batch, so hitting
 * it costs one extra round trip and nothing else.
 */
const MAX_BATCH = 32

/**
 * Read the relayed actions out of a request body.
 *
 * Two accepted shapes, and both have to stay accepted: `{ event }` is what every
 * bundle before batching sends, and a tab loaded across a deploy is exactly the
 * client this endpoint has learned not to refuse casually. `{ events: [...] }`
 * is the batch form, where `clientSeq` numbers the FIRST action and the rest
 * follow it contiguously.
 */
const readActions = (body: unknown): SerializedAction[] | null => {
	const batch = (body as { events?: unknown })?.events
	if (Array.isArray(batch)) {
		if (batch.length === 0 || batch.length > MAX_BATCH) return null
		if (!batch.every((action) => isValidSerializedAction(action))) return null
		return batch as SerializedAction[]
	}
	const single = (body as { event?: unknown })?.event
	if (!isValidSerializedAction(single)) return null
	return [single]
}

/**
 * A batch is credited to ONE actor, resolved once before anything is written, so
 * it must not span a turn handover. `end-turn` is therefore allowed only as the
 * final action, and `surrender` — which is rewritten to the sender's own team and
 * settles the room — only on its own. The client already flushes on both; this is
 * the server refusing to be talked out of the invariant.
 */
const spansTurnHandover = (actions: SerializedAction[]): boolean => {
	if (actions.length === 1) return false
	return actions.some(
		(action, index) =>
			action.kind === 'surrender' || (action.kind === 'end-turn' && index !== actions.length - 1)
	)
}

export const POST = async ({ request, params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	if (!session) throw error(400, 'Missing session')

	let body: unknown
	try {
		body = await request.json()
	} catch {
		throw error(400, 'Invalid JSON body')
	}
	const actions = readActions(body)
	if (!actions) throw error(400, 'Invalid action payload')
	if (spansTurnHandover(actions)) throw error(400, 'Batch spans a turn handover')

	// The sender's own 0-based counter for this room, naming the FIRST action in
	// the request. It is what carries the order the PLAYER acted in — the log's
	// `seq` only records which request won its insert race, which for two
	// overlapping requests is a coin flip (see `appendEvent`).
	//
	// REQUIRED, and the requirement is the point. It used to be optional, so a
	// client that didn't send one silently fell back to the old unordered,
	// non-idempotent append — the exact behaviour the ordering work removed. That
	// fallback is reachable by any browser tab loaded before the deploy that added
	// it, and match 13 is what that looks like from the inside: one player on a
	// stale bundle relayed unordered, the room recorded a `wait` ahead of the move
	// that created it, and both boards were unrecoverable from turn two on. One
	// party to a match must not be able to opt the whole room out of its ordering
	// guarantee, so an unordered relay is refused instead of served. 426 rather
	// than 400: the request is well-formed, the CLIENT is what's out of date.
	const rawClientSeq = (body as { clientSeq?: unknown })?.clientSeq
	if (typeof rawClientSeq !== 'number' || !Number.isInteger(rawClientSeq) || rawClientSeq < 0) {
		throw error(426, 'This version of the game is out of date. Reload to keep playing.')
	}
	const clientSeq = rawClientSeq
	// Side effects (turn handover, async clock, emails) can only ever hang off the
	// last action, since anything mid-batch that could move the turn is refused
	// above.
	const closing = actions[actions.length - 1]

	try {
		// The roster, whose-turn-it-is, and the room row are independent reads on
		// different tables, so resolve them together before validating any of them.
		//
		// `roster` rather than `members`: it carries seat order, `is_ai`, and the
		// team per seat, which is everything the AI-driver check below used to spend
		// two more round trips asking for (`isAiMember` + `aiDriver`). On a CPU
		// side's turn that was two extra gateway calls per action, on the one path
		// that fires hundreds of times a match.
		const [seats, currentAtRead, room] = await Promise.all([
			gameStore.roster(session),
			// `current_turn` is seeded to the creator at room creation, so it is set
			// here; only honour it when present (a legacy room may still be null).
			gameStore.currentTurn(session),
			gameStore.getRoom(session),
		])
		const members = seats.map((seat) => seat.userSession)
		if (members.length === 0 || !members.includes(userSession)) {
			throw error(403, 'Not a member of this game session')
		}

		// Async rooms enforce the turn clock lazily on every request that could
		// depend on it: if the current player's deadline passed, resign them NOW,
		// before validating this action against a stale turn pointer.
		let current = currentAtRead
		const isAsync = room?.mode === 'async'
		if (isAsync) {
			const enforced = await gameStore.enforceTurnDeadline(session, room)
			if (enforced) {
				await notifyAsyncTimeout(session, enforced, clampAsyncTimeout(room?.turn_timeout_ms))
				if (enforced.resigned.userSession === userSession) {
					throw error(403, 'Your turn timed out and the match was resigned')
				}
				current = enforced.next?.userSession ?? current
			}
		}

		// A surrender is always attributed to the SENDER's own team, never the
		// team the client claimed — otherwise a client whose local team is wrong
		// (or malicious) could resign someone else. Not gated on whose turn it is:
		// you can give up any time.
		let toRecord = actions
		// The events are normally recorded under the sender. The exception is a CPU
		// seat's turn: its designated human driver (the lowest-seat human) relays
		// the AI's moves, and those are recorded under the AI so turn rotation and
		// the log stay honest.
		let actor = userSession
		if (closing.kind === 'surrender') {
			const myTeam = seats.find((seat) => seat.userSession === userSession)?.team
			if (myTeam != null) toRecord = [{ ...closing, team: myTeam }]
			// A side can only quit once. On a board with three or more sides the match
			// carries on without the quitter, so their client stays on a live board as
			// a spectator with the give-up and exit-to-menu paths still wired — match
			// 19 recorded a second `{surrender, team: 2}` 640 events after the first.
			// It lands harmlessly on an already-lost team, but every client and the
			// replay still has to carry it, and a resign path that can fire twice is
			// worth refusing here rather than trusting the client not to. Reported as
			// success: the sender's intent (be out of this match) already holds.
			if (myTeam != null && (await gameStore.hasSurrendered(session, myTeam, room))) {
				return json({ event: null, events: [], appended: 0, turnDeadline: null })
			}
		} else if (current && current !== userSession) {
			const currentSeat = seats.find((seat) => seat.userSession === current)
			const driver = seats.find((seat) => !seat.isAi)?.userSession ?? null
			if (currentSeat?.isAi && driver === userSession) {
				actor = current
			} else {
				throw error(403, 'Not your turn')
			}
		}

		// Ordered against the SENDER, attributed to the ACTOR — they differ when a
		// human drives a CPU seat, whose actions ride the driver's request stream.
		const { events } = await gameStore.appendEvents(session, actor, toRecord, {
			senderSession: userSession,
			clientSeq,
		})
		const recorded = toRecord[toRecord.length - 1]
		// Whether the run actually reached its closing action. A batch cut short by
		// a rate limit throws (see the PartialAppendError branch), so reaching here
		// with fewer events than actions means the log already held some of them —
		// but the handover below must only fire once the closing action is really
		// in the log.
		const closed = events.length === toRecord.length

		let turnDeadline: number | null = isAsync ? (room?.turn_deadline ?? null) : null
		if (closed && !isAsync && recorded.kind === 'surrender' && current === actor) {
			// The side that just quit was holding the turn. Every client's engine has
			// already handed the turn to the next side (see applyAction's surrender
			// case), so the pointer has to follow or that side's every action comes
			// back "Not your turn". Two-side rooms never noticed: the match ends with
			// the forfeit. Async rooms take the richer path below (clock + emails).
			await gameStore.advanceTurn(session, actor, null, { seats, room })
		}
		if (closed && isAsync && recorded.kind === 'surrender') {
			// Settle the room server-side (turn pointer, clock, TTL) and tell the
			// opponent: in async play they are usually offline, and without this a
			// surrendered game would sit ticking until they happened to look.
			const settled = await gameStore.settleAsyncAfterSurrender(session, actor, room)
			if (settled) {
				turnDeadline = settled.gameOver
					? null
					: ((await gameStore.getRoom(session))?.turn_deadline ?? null)
				if (settled.gameOver && settled.next) {
					const actorSeat = seats.find((seat) => seat.userSession === actor)
					await notifyAsyncResignation({
						session,
						eventId: events[events.length - 1]?.id ?? -1,
						resignedUserAuth: actorSeat?.userAuth ?? null,
						opponentUserAuth: settled.next.userAuth,
					})
				}
			}
		}
		if (closed && recorded.kind === 'end-turn' && members.length > 1) {
			// Hand the pointer on in the ENGINE's order (ascending team), carrying
			// the ending client's own verdict for the one thing the server can't
			// see: a side eliminated in combat, which the engine skips and no event
			// records. Seat-index rotation was indistinguishable from this while
			// rooms held two seats; on a three-side map it hands the turn to the
			// wrong side and the match deadlocks. See gameStore.advanceTurn.
			const next = await gameStore.advanceTurn(session, actor, recorded.next ?? null, {
				seats,
				room,
			})
			if (!next) {
				// Nothing eligible to rotate to (no seat carries a team yet) — keep
				// the old seat walk so such a room still moves rather than freezing.
				const idx = members.indexOf(actor)
				await gameStore.setCurrentTurn(session, members[(idx + 1) % members.length])
			}
			if (isAsync) {
				// The next player gets the room's full per-turn allowance, and an
				// email — in async play they are usually offline right now, and the
				// notification is how they learn the game moved.
				turnDeadline = await gameStore.resetTurnDeadline(session, room)
				const actorSeat = seats.find((seat) => seat.userSession === actor)
				await notifyAsyncYourTurn({
					session,
					eventId: events[events.length - 1]?.id ?? -1,
					nextUserAuth: next?.userAuth ?? null,
					opponentAuth: actorSeat?.userAuth ?? null,
					turnTimeoutMs: clampAsyncTimeout(room?.turn_timeout_ms),
				})
			}
		}

		// Push the recorded events to everyone in the room, as ONE frame. Best-effort
		// — the event log above is the source of truth, and after an end-turn the
		// publish must come AFTER the turn handover so a subscriber who acts on it
		// immediately isn't rejected as "not your turn".
		//
		// One frame per batch rather than one per event is what keeps the receiving
		// client's poll on its slow interval: a contiguous run arrives with no gap
		// for the push buffer to stall on, so the socket never looks unreliable and
		// the 1.5s reconciliation poll — five gateway calls a pass, per client —
		// stays switched off.
		await realtime.tryPublish(`game:${session}`, publishPayload(events))

		return json({ ...eventFields(events), turnDeadline })
	} catch (msg) {
		// `isHttpError`, not a duck-typed `'status' in msg`. The loose check was
		// meant to re-throw our own `error(...)` results untouched, but the SDK's
		// `DontCodeError` carries `status` and `body` too — so a gateway failure on
		// this path (a rate limit, a "temporarily unavailable") was re-thrown with
		// the GATEWAY's status and never reached `logToErrorDb`. That is why a move
		// could vanish leaving no server-side trace at all: the one path that
		// records why a relay failed was the one path a failed relay skipped.
		if (isHttpError(msg)) throw msg
		if (msg instanceof OutOfOrderEventError) {
			// This request is out of step with the sender's own stream — it overtook an
			// earlier one of theirs, or their counter is stale after a reload. Recording
			// it would put the log in an order the player never played, which is the
			// exact corruption that made a relayed attack unapplyable for everyone else.
			//
			// A plain `json` rather than `error()` so the response can carry `expected`:
			// the client resets its counter to that and retries, which self-heals a
			// reload without a round of guessing.
			return json({ expected: msg.expected, received: msg.received }, { status: 409 })
		}
		if (msg instanceof PartialAppendError && msg.events.length > 0) {
			// Some of the run is durably recorded and the rest is not. That prefix is
			// as real as any other append, so it is reported as a success — with the
			// count, so the sender settles exactly those ordinals and re-sends the
			// remainder instead of re-sending a batch the unique index will refuse.
			//
			// Deliberately 200: the alternative is telling a client that something
			// worked as though it failed, and the one thing worse than a slow relay is
			// a client that concludes recorded actions were lost and freezes the board.
			const limit = noteRateLimit(msg.cause, 'db/write')
			const retryAfter = limit.limited
				? Math.max(1, gatewayCooldownSeconds(limit.scope ?? 'db/write'))
				: undefined
			await logToErrorDb(msg.cause, 'Move relay partially recorded')
			// No publish here: the closing action never landed, so the turn pointer
			// has not moved, and the receiving clients pick the prefix up on their
			// next poll rather than from a frame that would look like a whole turn.
			return json({
				...eventFields(msg.events),
				partial: true,
				rateLimited: limit.limited,
				retryAfter,
			})
		}
		const cause = msg instanceof PartialAppendError ? msg.cause : msg
		// A gateway rate limit is not this move's fault and not a lost move — the
		// action simply never reached the log, and the gateway told us exactly how
		// long until it will. Answer 429 with that budget rather than a blank 500:
		// the client backs off and re-sends the same ordinal (which the server
		// dedupes), instead of concluding the action was lost and freezing the
		// board over a delay that resolves itself.
		const limit = noteRateLimit(cause, 'db/write')
		if (limit.limited) {
			const retryAfter = Math.max(1, gatewayCooldownSeconds(limit.scope ?? 'db/write'))
			await logToErrorDb(cause, 'Move relay rate limited')
			return json(
				{ error: 'Server is busy', rateLimited: true, retryAfter },
				{ status: 429, headers: { 'retry-after': `${retryAfter}` } }
			)
		}
		await logToErrorDb(cause)
		throw error(500, 'Could not record move')
	}
}

/**
 * The recorded events, in both shapes. `events` is what a batching client reads;
 * `event` is the last of them, which is what every bundle before batching reads
 * to advance its cursor — and since it advances to the highest id it sees, the
 * last one is the correct answer for it even when a batch carried several.
 */
const eventFields = (events: GameEvent[]) => ({
	event: events[events.length - 1] ?? null,
	events,
	appended: events.length,
})

/**
 * One realtime frame carrying the whole run. `event` is repeated as the first of
 * the batch for subscribers on an older bundle: they apply that one and let their
 * reconciliation poll recover the rest, which is a slow path but never a wrong
 * one. Newer subscribers read `events` and apply all of it in order.
 */
const publishPayload = (events: GameEvent[]) => ({
	event: events[0] ?? null,
	events,
})
