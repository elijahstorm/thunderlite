import { json } from '@sveltejs/kit'
import { realtime } from '$lib/dontcode/server'
import { queryUsersByAuth } from '$lib/Database/getUserData'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

/**
 * Who is signed in right now. Every client subscribes to `chat:global` purely
 * for presence (see ChatSocket), minting that token with the profile `auth` as
 * identity — so presence entries are auth ids we can hydrate straight into
 * profiles for the People panel's "Online now" section.
 *
 * Degrades quietly: if the gateway has no realtime (e.g. the local mock) this
 * returns an empty list rather than erroring, so the panel just falls back to
 * the friends list with no online dots.
 */
export const GET = async ({ locals }) => {
	const me = locals.user
	if (!me) return json({ users: [] })

	try {
		const present = await realtime.presence('chat:global')
		const auths = [
			...new Set(
				present.map((entry) => entry.identity).filter((id): id is string => !!id && id !== me)
			),
		]
		const users = auths.length ? await queryUsersByAuth(auths, me) : []
		return json({ users })
	} catch (msg) {
		// No realtime service here — treat as "nobody resolvable is online".
		logToErrorDb(msg)
		return json({ users: [] })
	}
}
