import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import { getPlayerRatings } from '$lib/Database/getPlayerRatings'
import { db } from '$lib/dontcode/server'

export const getUserDBDataFromAuth = async (auth: string, me: string = '') => {
	let user: UserDBData | null

	try {
		// The old single query joined messages / relationships onto users; the
		// platform API has no joins, so the profile row is fetched first and each
		// derived flag is composed from its own lookup.
		const profile = await db.findOne<UserDBData>('profiles', { where: { auth } })

		if (profile) {
			// The derived flags are all viewer-relative. With no viewer (`me === ''`,
			// e.g. a logged-out profile view) they're all false/0/null, so skip the
			// round-trips entirely rather than querying `source: ''` — same
			// logged-out short-circuit as the batched `queryUsersByAuth`.
			// The ladder rating is NOT viewer-relative (a rating is public and the
			// same for everyone), so it is fetched either way.
			//
			// The reverse relationship row is read purely to derive `blocked`: a
			// block only exists on the blocker's row, so without the other direction
			// a viewer who was blocked would look unblocked and every surface that
			// gates on this flag would let them straight through.
			type Social = [number, { status: RelationshipStatus } | null, { id: number } | null]
			const [ratings, social] = await Promise.all([
				getPlayerRatings([auth]),
				me
					? Promise.all([
							db.count('messages', { source: me, target: auth }),
							db.findOne<{ status: RelationshipStatus }>('relationships', {
								where: { source: me, target: auth },
								select: ['status'],
							}),
							db.findOne<{ id: number }>('relationships', {
								where: { source: auth, target: me, status: 'blocked' },
								select: ['id'],
							}),
						])
					: Promise.resolve<Social>([0, null, null]),
			])
			const [messageCount, relationship, blockedMe] = social

			user = {
				...profile,
				message_count: messageCount,
				relationship: relationship?.status ?? null,
				blocked: relationship?.status === 'blocked' || !!blockedMe,
				elo: ratings.get(auth) ?? null,
			} as UserDBData
		} else {
			user = null
		}
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not get user from database')
	}

	if (!user) {
		throw error(400, { message: 'No user found.' })
	}

	return user
}

/**
 * Batched sibling of {@link getUserDBDataFromAuth} for hydrating many owners at
 * once (e.g. the /make listing). The per-auth version fires 1 + 3 calls PER
 * user; looping it over a page of maps is a classic N+1. This resolves every
 * profile in one `in` query and, when there's a viewer, every derived flag in a
 * single batched wave — same idiom as {@link queryUsers}.
 *
 * Logged-out browse (`me === ''`) skips the social lookups entirely:
 * message_count / relationship / blocked are all 0/null/false with no viewer,
 * so there's nothing to fetch. That drops 3 calls to 0 on the hottest path.
 *
 * Unlike the single-user version this never throws on a missing profile — an
 * owner without a profile row is simply omitted rather than 500-ing the whole
 * listing.
 */
export const queryUsersByAuth = async (auths: string[], me: string = ''): Promise<UserDBData[]> => {
	const uniqueAuths = [...new Set(auths)].filter(Boolean)
	if (uniqueAuths.length === 0) return []

	try {
		const [profiles, messageRows, relationshipRows, blockedMeRows, ratings] = await Promise.all([
			db.find<UserDBData>('profiles', { where: { auth: { in: uniqueAuths } } }),
			me
				? db.find<{ target: string }>('messages', {
						where: { source: me, target: { in: uniqueAuths } },
						select: ['target'],
					})
				: Promise.resolve<{ target: string }[]>([]),
			me
				? db.find<{ target: string; status: RelationshipStatus }>('relationships', {
						where: { source: me, target: { in: uniqueAuths } },
						select: ['target', 'status'],
					})
				: Promise.resolve<{ target: string; status: RelationshipStatus }[]>([]),
			// The other direction, blocks only. A block lives on the blocker's row
			// alone, so this is the only way the viewer learns they were blocked —
			// and every listing that hides blocked players reads the flag it feeds.
			me
				? db.find<{ source: string }>('relationships', {
						where: { source: { in: uniqueAuths }, target: me, status: 'blocked' },
						select: ['source'],
					})
				: Promise.resolve<{ source: string }[]>([]),
			// Ratings are public, so unlike the social flags above they are
			// fetched with or without a viewer. One `in` query for the page.
			getPlayerRatings(uniqueAuths),
		])

		const relationships = new Map(relationshipRows.map((row) => [row.target, row.status]))
		const blockedMe = new Set(blockedMeRows.map((row) => row.source))
		const messageCounts = new Map<string, number>()
		for (const row of messageRows) {
			messageCounts.set(row.target, (messageCounts.get(row.target) ?? 0) + 1)
		}

		return profiles.map(
			(profile) =>
				({
					...profile,
					message_count: messageCounts.get(profile.auth) ?? 0,
					relationship: relationships.get(profile.auth) ?? null,
					blocked: relationships.get(profile.auth) === 'blocked' || blockedMe.has(profile.auth),
					elo: ratings.get(profile.auth) ?? null,
				}) as UserDBData
		)
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not get users from database')
	}
}

/**
 * Create the profile row for a signed-in account.
 *
 * `email` is stored on the row from the start when the caller has it. Without
 * it the profile is unreachable by email: `notify()` resolves recipients from
 * `profiles.email`, so a user who has never acted (and therefore never hit
 * `rememberEmail`) silently receives nothing.
 */
export const makeUserDBDataFromAuth = async (auth: string, email?: string) => {
	try {
		await db.insert('profiles', email ? { auth, email } : { auth })
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not make user')
	}
}

export const updateUserDBData = async (
	auth: string,
	user: UserDBData,
	entries: (keyof UserDBData)[]
) => {
	try {
		const data = Object.fromEntries(entries.map((entry) => [entry, user[entry]]))
		await db.update('profiles', { auth }, data)
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not make user')
	}
}
