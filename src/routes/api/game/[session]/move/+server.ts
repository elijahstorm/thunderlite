import { error, json } from '@sveltejs/kit'
import { KV_REST_API_TOKEN, KV_REST_API_URL } from '$env/static/private'
import { createClient } from '@vercel/kv'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { isValidSerializedAction, type GameEvent } from '$lib/Engine/Interactor/serializedAction.js'

const EVENTS_KEY = (session: string) => `game-events:${session}`
const CURRENT_KEY = (session: string) => `game-current:${session}`
const MEMBERS_KEY = (session: string) => `game:${session}`

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

	const kv = createClient({
		url: KV_REST_API_URL,
		token: KV_REST_API_TOKEN,
	})

	try {
		const members = ((await kv.smembers(MEMBERS_KEY(session))) as string[] | null) ?? []
		if (members.length === 0 || !members.includes(userSession)) {
			throw error(403, 'Not a member of this game session')
		}

		let current = (await kv.get(CURRENT_KEY(session))) as string | null
		if (!current) {
			current = userSession
			await kv.set(CURRENT_KEY(session), current)
		}

		if (current !== userSession) {
			throw error(403, 'Not your turn')
		}

		const length = (await kv.llen(EVENTS_KEY(session))) as number
		const id = typeof length === 'number' ? length : 0
		const event: GameEvent = {
			id,
			userSession,
			action,
			ts: Date.now(),
		}
		await kv.rpush(EVENTS_KEY(session), JSON.stringify(event))

		if (action.kind === 'end-turn' && members.length > 1) {
			const idx = members.indexOf(userSession)
			const nextIdx = (idx + 1) % members.length
			await kv.set(CURRENT_KEY(session), members[nextIdx])
		}

		return json({ event })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Cannot get from Redis storage')
	}
}
