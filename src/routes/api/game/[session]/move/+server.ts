import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { isValidSerializedAction } from '$lib/Engine/Interactor/serializedAction.js'
import { gameStore, OutOfOrderEventError } from '$lib/Game/store.server'
import { realtime } from '$lib/dontcode/server'
import {
	notifyAsyncResignation,
	notifyAsyncTimeout,
	notifyAsyncYourTurn,
} from '$lib/Game/asyncNotify.server'
import { clampAsyncTimeout } from '$lib/Game/asyncConfig'

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
	const action = (body as { event?: unknown })?.event
	if (!isValidSerializedAction(action)) throw error(400, 'Invalid action payload')

	// The sender's own 0-based counter for this room. It is what carries the order
	// the PLAYER acted in — the log's `seq` only records which request won its
	// insert race, which for two overlapping requests is a coin flip (see
	// `appendEvent`). Optional: a client that doesn't send one keeps the old
	// unordered, non-idempotent behaviour.
	const rawClientSeq = (body as { clientSeq?: unknown })?.clientSeq
	const clientSeq =
		typeof rawClientSeq === 'number' && Number.isInteger(rawClientSeq) && rawClientSeq >= 0
			? rawClientSeq
			: undefined

	try {
		// Membership, whose-turn-it-is, and the room row are independent reads on
		// different tables, so resolve them together before validating any of them.
		const [members, currentAtRead, room] = await Promise.all([
			gameStore.members(session),
			// `current_turn` is seeded to the creator at room creation, so it is set
			// here; only honour it when present (a legacy room may still be null).
			gameStore.currentTurn(session),
			gameStore.getRoom(session),
		])
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
		let toRecord = action
		// The event is normally recorded under the sender. The exception is a CPU
		// seat's turn: its designated human driver (the lowest-seat human) relays
		// the AI's moves, and those are recorded under the AI so turn rotation and
		// the log stay honest.
		let actor = userSession
		if (action.kind === 'surrender') {
			const myTeam = await gameStore.teamOf(session, userSession)
			if (myTeam != null) toRecord = { ...action, team: myTeam }
		} else if (current && current !== userSession) {
			const [currentIsAi, driver] = await Promise.all([
				gameStore.isAiMember(session, current),
				gameStore.aiDriver(session),
			])
			if (currentIsAi && driver === userSession) {
				actor = current
			} else {
				throw error(403, 'Not your turn')
			}
		}

		// Ordered against the SENDER, attributed to the ACTOR — they differ when a
		// human drives a CPU seat, whose actions ride the driver's request stream.
		const event = await gameStore.appendEvent(session, actor, toRecord, {
			senderSession: userSession,
			clientSeq,
		})

		let turnDeadline: number | null = isAsync ? (room?.turn_deadline ?? null) : null
		if (!isAsync && toRecord.kind === 'surrender' && current === actor) {
			// The side that just quit was holding the turn. Every client's engine has
			// already handed the turn to the next side (see applyAction's surrender
			// case), so the pointer has to follow or that side's every action comes
			// back "Not your turn". Two-side rooms never noticed: the match ends with
			// the forfeit. Async rooms take the richer path below (clock + emails).
			await gameStore.advanceTurn(session, actor)
		}
		if (isAsync && toRecord.kind === 'surrender') {
			// Settle the room server-side (turn pointer, clock, TTL) and tell the
			// opponent: in async play they are usually offline, and without this a
			// surrendered game would sit ticking until they happened to look.
			const settled = await gameStore.settleAsyncAfterSurrender(session, actor, room)
			if (settled) {
				turnDeadline = settled.gameOver
					? null
					: ((await gameStore.getRoom(session))?.turn_deadline ?? null)
				if (settled.gameOver && settled.next) {
					const roster = await gameStore.roster(session)
					const actorMember = roster.find((m) => m.userSession === actor)
					await notifyAsyncResignation({
						session,
						eventId: event.id,
						resignedUserAuth: actorMember?.userAuth ?? null,
						opponentUserAuth: settled.next.userAuth,
					})
				}
			}
		}
		if (action.kind === 'end-turn' && members.length > 1) {
			// Hand the pointer on in the ENGINE's order (ascending team), carrying
			// the ending client's own verdict for the one thing the server can't
			// see: a side eliminated in combat, which the engine skips and no event
			// records. Seat-index rotation was indistinguishable from this while
			// rooms held two seats; on a three-side map it hands the turn to the
			// wrong side and the match deadlocks. See gameStore.advanceTurn.
			const next = await gameStore.advanceTurn(session, actor, action.next ?? null)
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
				const roster = await gameStore.roster(session)
				const actorMember = roster.find((m) => m.userSession === actor)
				await notifyAsyncYourTurn({
					session,
					eventId: event.id,
					nextUserAuth: next?.userAuth ?? null,
					opponentAuth: actorMember?.userAuth ?? null,
					turnTimeoutMs: clampAsyncTimeout(room?.turn_timeout_ms),
				})
			}
		}

		// Push the recorded event to everyone in the room. Best-effort — the
		// event log above is the source of truth, and after an end-turn the
		// publish must come AFTER the turn handover so a subscriber who acts
		// on it immediately isn't rejected as "not your turn".
		await realtime.tryPublish(`game:${session}`, { event })

		return json({ event, turnDeadline })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
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
		await logToErrorDb(msg)
		throw error(500, 'Could not record move')
	}
}
