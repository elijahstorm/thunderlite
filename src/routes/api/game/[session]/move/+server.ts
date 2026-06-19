import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { isValidSerializedAction } from '$lib/Engine/Interactor/serializedAction.js'
import { gameStore } from '$lib/Game/store.server'

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
		const members = await gameStore.members(session)
		if (members.length === 0 || !members.includes(userSession)) {
			throw error(403, 'Not a member of this game session')
		}

		// `current_turn` is seeded to the creator at room creation, so it is set
		// here; only honour it when present (a legacy room may still be null).
		const current = await gameStore.currentTurn(session)
		if (current && current !== userSession) {
			throw error(403, 'Not your turn')
		}

		const event = await gameStore.appendEvent(session, userSession, action)

		if (action.kind === 'end-turn' && members.length > 1) {
			const idx = members.indexOf(userSession)
			const nextIdx = (idx + 1) % members.length
			await gameStore.setCurrentTurn(session, members[nextIdx])
		}

		return json({ event })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not record move')
	}
}
