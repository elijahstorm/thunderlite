import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import { getPlayerRatings } from '$lib/Database/getPlayerRatings'
import { db } from '$lib/dontcode/server'

type QueryType = 'public' | 'friends'

type MessageRow = {
	source: string
	target: string
	message: string
	read_at: string | null
	created_at: string
}

const query: (type: QueryType) => (
	props: {
		page?: number
	},
	me?: string
) => Promise<{ users: UserDBData[] }> =
	(type) =>
	async ({ page }, me = '') => {
		let users: UserDBData[]
		const limit = 10

		try {
			// The old single query joined relationships / a lateral last-message onto
			// users; the platform API has no joins, so we fetch the candidate
			// profiles first, batch-fetch the related rows with `in` filters and
			// compose (plus sort and paginate) in JS.
			let candidates: UserDBData[]

			if (type === 'public') {
				candidates = await db.find<UserDBData>('profiles', {
					where: { auth: { not: me }, private: false, profile_image_url: { not: null } },
					orderBy: { created_at: 'desc' },
				})
			} else {
				const relationships = await db.find<{ target: string }>('relationships', {
					where: { source: me, status: 'friends' },
					select: ['target'],
				})
				const auths = [...new Set(relationships.map((relationship) => relationship.target))].filter(
					(auth) => auth !== me
				)
				candidates = auths.length
					? await db.find<UserDBData>('profiles', { where: { auth: { in: auths } } })
					: []
			}

			const auths = candidates.map((user) => user.auth)

			const [relationshipRows, blockedMeRows, sentMessages, receivedMessages] = auths.length
				? await Promise.all([
						db.find<{ target: string; status: RelationshipStatus }>('relationships', {
							where: { source: me, target: { in: auths } },
							select: ['target', 'status'],
						}),
						// The other direction, blocks only — a block lives on the blocker's
						// row alone, so this is what stops someone who blocked the viewer
						// from still surfacing in their people lists.
						db.find<{ source: string }>('relationships', {
							where: { source: { in: auths }, target: me, status: 'blocked' },
							select: ['source'],
						}),
						db.find<MessageRow>('messages', { where: { source: me, target: { in: auths } } }),
						db.find<MessageRow>('messages', { where: { source: { in: auths }, target: me } }),
					])
				: [[], [], [], []]

			const relationships = new Map(relationshipRows.map((row) => [row.target, row.status]))
			const blockedMe = new Set(blockedMeRows.map((row) => row.source))

			// Replaces the lateral join: the newest message per counterpart.
			const lastMessages = new Map<string, MessageRow>()
			for (const message of [...sentMessages, ...receivedMessages]) {
				const other = message.source === me ? message.target : message.source
				const previous = lastMessages.get(other)
				if (!previous || new Date(message.created_at) > new Date(previous.created_at)) {
					lastMessages.set(other, message)
				}
			}

			// A block hides the pair from each other's people lists, in both
			// directions. Done before the sort and the page slice so a blocked player
			// can't eat a slot in the window and leave a short page behind.
			users = candidates
				.filter(
					(profile) => relationships.get(profile.auth) !== 'blocked' && !blockedMe.has(profile.auth)
				)
				.map((profile) => {
					const last = lastMessages.get(profile.auth)
					return {
						...profile,
						relationship: relationships.get(profile.auth) ?? null,
						blocked: false,
						last_message: {
							message: last?.message ?? null,
							unread: last && last.source !== me && last.read_at === null ? 1 : 0,
							when: last?.created_at ?? null,
						},
					} as unknown as UserDBData
				})

			// order by last_message.created_at desc nulls last, then friends first
			const when = (user: UserDBData) =>
				user.last_message?.when ? new Date(user.last_message.when).getTime() : null
			users.sort((a, b) => {
				const aWhen = when(a)
				const bWhen = when(b)
				if (aWhen !== bWhen) {
					if (aWhen === null) return 1
					if (bWhen === null) return -1
					return bWhen - aWhen
				}
				const aRank = a.relationship === 'friends' ? 1 : 2
				const bRank = b.relationship === 'friends' ? 1 : 2
				if (aRank !== bRank) return aRank - bRank
				// Deterministic tiebreak: Postgres returns candidates in an unstable
				// scan order, so without this the page window (slice below) shifts
				// between requests and a user flickers in and out of page 0 whenever
				// there's no chat history to order by.
				const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
				const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
				if (aCreated !== bCreated) return bCreated - aCreated
				return a.auth < b.auth ? -1 : a.auth > b.auth ? 1 : 0
			})

			users = users.slice((page ?? 0) * limit, (page ?? 0) * limit + limit)

			// Ladder ratings last, on the sliced page only: the candidate set can be
			// every public profile, and only the ten rows actually rendered need a
			// rating chip.
			const ratings = await getPlayerRatings(users.map((user) => user.auth))
			users = users.map((user) => ({ ...user, elo: ratings.get(user.auth) ?? null }))
		} catch (msg) {
			await logToErrorDb(msg)
			throw error(500, 'Could not get users from database')
		}

		return {
			users,
		}
	}

export const queryUsers = query('public')
export const queryFriends = query('friends')
