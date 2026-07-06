import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import { db } from '$lib/dontcode/server'

export const getUserDBDataFromAuth = async (auth: string, me: string = '') => {
	let user: UserDBData | null

	try {
		// The old single query joined follows / messages / relationships onto
		// users; the platform API has no joins, so the profile row is fetched
		// first and each derived flag is composed from its own lookup.
		const profile = await db.findOne<UserDBData>('profiles', { where: { auth } })

		if (profile) {
			// The derived flags are all viewer-relative. With no viewer (`me === ''`,
			// e.g. a logged-out profile view) they're all false/0/null, so skip the
			// four round-trips entirely rather than querying `source: ''` — same
			// logged-out short-circuit as the batched `queryUsersByAuth`.
			const [following, follower, messageCount, relationship] = me
				? await Promise.all([
						db.count('follows', { source: me, target: auth }),
						db.count('follows', { source: auth, target: me }),
						db.count('messages', { source: me, target: auth }),
						db.findOne<{ status: RelationshipStatus }>('relationships', {
							where: { source: me, target: auth },
							select: ['status'],
						}),
					])
				: [0, 0, 0, null as { status: RelationshipStatus } | null]

			user = {
				...profile,
				following: following > 0,
				follower: follower > 0,
				message_count: messageCount,
				relationship: relationship?.status ?? null,
			} as UserDBData
		} else {
			user = null
		}
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not get user from database')
	}

	if (!user) {
		throw error(400, { message: 'No user found.' })
	}

	return user
}

/**
 * Batched sibling of {@link getUserDBDataFromAuth} for hydrating many owners at
 * once (e.g. the /make listing). The per-auth version fires 1 + 4 calls PER
 * user; looping it over a page of maps is a classic N+1. This resolves every
 * profile in one `in` query and, when there's a viewer, every derived flag in a
 * single batched wave — same idiom as {@link queryUsers}.
 *
 * Logged-out browse (`me === ''`) skips the social lookups entirely: following /
 * follower / message_count / relationship are all false/0/null with no viewer,
 * so there's nothing to fetch. That drops 4 calls to 0 on the hottest path.
 *
 * Unlike the single-user version this never throws on a missing profile — an
 * owner without a profile row is simply omitted rather than 500-ing the whole
 * listing.
 */
export const queryUsersByAuth = async (
	auths: string[],
	me: string = ''
): Promise<UserDBData[]> => {
	const uniqueAuths = [...new Set(auths)].filter(Boolean)
	if (uniqueAuths.length === 0) return []

	try {
		const [profiles, followingRows, followerRows, messageRows, relationshipRows] =
			await Promise.all([
				db.find<UserDBData>('profiles', { where: { auth: { in: uniqueAuths } } }),
				me
					? db.find<{ target: string }>('follows', {
							where: { source: me, target: { in: uniqueAuths } },
							select: ['target'],
						})
					: Promise.resolve<{ target: string }[]>([]),
				me
					? db.find<{ source: string }>('follows', {
							where: { source: { in: uniqueAuths }, target: me },
							select: ['source'],
						})
					: Promise.resolve<{ source: string }[]>([]),
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
			])

		const following = new Set(followingRows.map((row) => row.target))
		const followers = new Set(followerRows.map((row) => row.source))
		const relationships = new Map(relationshipRows.map((row) => [row.target, row.status]))
		const messageCounts = new Map<string, number>()
		for (const row of messageRows) {
			messageCounts.set(row.target, (messageCounts.get(row.target) ?? 0) + 1)
		}

		return profiles.map(
			(profile) =>
				({
					...profile,
					following: following.has(profile.auth),
					follower: followers.has(profile.auth),
					message_count: messageCounts.get(profile.auth) ?? 0,
					relationship: relationships.get(profile.auth) ?? null,
				}) as UserDBData
		)
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not get users from database')
	}
}

export const makeUserDBDataFromAuth = async (auth: string) => {
	try {
		await db.insert('profiles', { auth })
	} catch (msg) {
		logToErrorDb(msg)
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
		logToErrorDb(msg)
		throw error(500, 'Could not make user')
	}
}
