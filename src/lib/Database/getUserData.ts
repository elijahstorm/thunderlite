import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import { db } from '$lib/Server/dontcode'

export const getUserDBDataFromAuth = async (auth: string, me: string = '') => {
	let user: UserDBData | null

	try {
		// The old single query joined follows / messages / relationships onto
		// users; the platform API has no joins, so the profile row is fetched
		// first and each derived flag is composed from its own lookup.
		const profile = await db.findOne<UserDBData>('profiles', { where: { auth } })

		if (profile) {
			const [following, follower, messageCount, relationship] = await Promise.all([
				db.count('follows', { source: me, target: auth }),
				db.count('follows', { source: auth, target: me }),
				db.count('messages', { source: me, target: auth }),
				db.findOne<{ status: RelationshipStatus }>('relationships', {
					where: { source: me, target: auth },
					select: ['status'],
				}),
			])

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
