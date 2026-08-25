import { json } from '@sveltejs/kit'
import { realtime } from '$lib/dontcode/server'
import { queryUsersByAuth } from '$lib/Database/getUserData'
import { gatewayCooldownSeconds, noteRateLimit } from '$lib/Security/rateLimit'

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
		//
		// Deliberately not logged as an error. This endpoint is polled every 12
		// seconds by every open client, and a gateway with no realtime (the local
		// mock, or a throttled production gateway) fails it every single time —
		// so logging it wrote a row per client per 12s for a condition the comment
		// above calls normal. The response tells the client how long to back off
		// instead, which is the part anybody can act on.
		const limit = noteRateLimit(msg)
		return json(
			{ users: [], degraded: true, retryAfter: gatewayCooldownSeconds() },
			limit.limited ? { headers: { 'retry-after': `${gatewayCooldownSeconds()}` } } : {}
		)
	}
}
