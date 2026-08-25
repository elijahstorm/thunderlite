import { json } from '@sveltejs/kit'
import { realtime } from '$lib/dontcode/server'
import { queryUsersByAuth } from '$lib/Database/getUserData'
import { budgetPressure, gatewayCooldownSeconds, noteRateLimit } from '$lib/Security/rateLimit'

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

	// Presence costs the `realtime` budget; turning those ids into profiles costs
	// the `db` budget that live matches run on. Every open client polls this every
	// 12 seconds, so under database pressure the hydration is the first thing that
	// should go — a stale friends list costs nobody a match.
	if (budgetPressure('db')) return json({ users: [], degraded: true, retryAfter: 0 })

	try {
		const present = await realtime.presence('chat:global')
		const auths = [
			...new Set(
				present.map((entry) => entry.identity).filter((id): id is string => !!id && id !== me)
			),
		]
		// `queryUsersByAuth` hydrates the block flag for the viewer, so honouring a
		// block here is a filter rather than another round-trip. Presence is the one
		// list a blocked player would otherwise keep appearing in, since it is built
		// from whoever happens to be connected rather than from any relationship.
		const users = auths.length
			? (await queryUsersByAuth(auths, me)).filter((user) => !user.blocked)
			: []
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
		// `realtime` is the budget this endpoint spends first (presence), and it is
		// the roomiest one the gateway grants — 1200/min against the db's 600. A
		// limit here is far more likely to have come from the `queryUsersByAuth`
		// hydration behind it, so let the error name its own scope and fall back to
		// realtime only when it doesn't.
		const limit = noteRateLimit(msg, 'realtime')
		const retryAfter = limit.scope ? gatewayCooldownSeconds(limit.scope) : 0
		return json(
			{ users: [], degraded: true, retryAfter },
			limit.limited && retryAfter > 0 ? { headers: { 'retry-after': `${retryAfter}` } } : {}
		)
	}
}
