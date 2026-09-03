import { error, json } from '@sveltejs/kit'
import { gameStore } from '$lib/Game/store.server'
import { isPublicKeyJwk, parsePublicKey } from '$lib/Security/frameSigning'

/**
 * A seat's signing key (see `frameSigning.ts`).
 *
 *   POST { pubkey }   register this player's public key for the room. One write,
 *                     once per player per match (a reload reuses the stored key).
 *   GET               every seat's registered key, for a receiver that met a
 *                     sender it has no key for: someone who joined, or re-keyed,
 *                     after this client loaded the room. One read, and the client
 *                     asks at most once a turn.
 *
 * Members only. A key is public by nature, but a room's roster is its players'
 * business, same as the event log.
 */
export const POST = async ({ request, params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const session = params.session
	if (!session) throw error(400, 'Missing session')

	let body: { pubkey?: unknown }
	try {
		body = await request.json()
	} catch {
		throw error(400, 'Invalid JSON body')
	}
	if (!isPublicKeyJwk(body.pubkey)) throw error(400, 'Invalid public key')

	const stored = await gameStore.setMemberKey(session, userSession, body.pubkey)
	if (!stored) throw error(403, 'Not a member of this game session')
	return json({ ok: true })
}

export const GET = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const session = params.session
	if (!session) throw error(400, 'Missing session')

	const roster = await gameStore.roster(session)
	if (!roster.some((m) => m.userSession === userSession)) {
		throw error(403, 'Not a member of this game session')
	}
	const keys: Record<string, unknown> = {}
	for (const seat of roster) {
		const key = parsePublicKey(seat.pubkey)
		if (key) keys[seat.userSession] = key
	}
	return json({ keys })
}
