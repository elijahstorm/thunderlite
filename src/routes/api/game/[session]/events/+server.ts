import { error, json } from '@sveltejs/kit'
import { KV_REST_API_TOKEN, KV_REST_API_URL } from '$env/static/private'
import { createClient } from '@vercel/kv'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import type { GameEvent } from '$lib/Engine/Interactor/serializedAction.js'

const EVENTS_KEY = (session: string) => `game-events:${session}`
const MEMBERS_KEY = (session: string) => `game:${session}`

export const GET = async ({ url, params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	if (!session) throw error(400, 'Missing session')

	const sinceRaw = url.searchParams.get('since')
	const since = sinceRaw === null ? -1 : parseInt(sinceRaw, 10)
	if (!Number.isFinite(since)) throw error(400, 'Invalid since parameter')

	const kv = createClient({
		url: KV_REST_API_URL,
		token: KV_REST_API_TOKEN,
	})

	try {
		const members = ((await kv.smembers(MEMBERS_KEY(session))) as string[] | null) ?? []
		if (members.length === 0 || !members.includes(userSession)) {
			throw error(403, 'Not a member of this game session')
		}

		const startIndex = Math.max(0, since + 1)
		const raw = ((await kv.lrange(EVENTS_KEY(session), startIndex, -1)) as
			| unknown[]
			| null) ?? []
		const events: GameEvent[] = []
		for (const entry of raw) {
			try {
				const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry
				if (parsed && typeof parsed === 'object' && typeof (parsed as GameEvent).id === 'number') {
					events.push(parsed as GameEvent)
				}
			} catch {
				continue
			}
		}

		const total = ((await kv.llen(EVENTS_KEY(session))) as number) ?? 0
		const lastEventId = total > 0 ? total - 1 : -1

		return json({ events, lastEventId })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(locals.sql)(msg)
		throw error(500, 'Cannot get from Redis storage')
	}
}
