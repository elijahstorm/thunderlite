import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { isValidSerializedAction } from '$lib/Engine/Interactor/serializedAction.js'
import { gameStore } from '$lib/Game/store.server'
import { realtime } from '$lib/dontcode/server'

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

	try {
		// Membership and whose-turn-it-is are independent reads on different
		// tables, so resolve them together before validating either.
		const [members, current] = await Promise.all([
			gameStore.members(session),
			// `current_turn` is seeded to the creator at room creation, so it is set
			// here; only honour it when present (a legacy room may still be null).
			gameStore.currentTurn(session),
		])
		if (members.length === 0 || !members.includes(userSession)) {
			throw error(403, 'Not a member of this game session')
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

		const event = await gameStore.appendEvent(session, actor, toRecord)

		if (action.kind === 'end-turn' && members.length > 1) {
			const idx = members.indexOf(actor)
			const nextIdx = (idx + 1) % members.length
			await gameStore.setCurrentTurn(session, members[nextIdx])
		}

		// Push the recorded event to everyone in the room. Best-effort — the
		// event log above is the source of truth, and after an end-turn the
		// publish must come AFTER the turn handover so a subscriber who acts
		// on it immediately isn't rejected as "not your turn".
		await realtime.tryPublish(`game:${session}`, { event })

		return json({ event })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not record move')
	}
}
