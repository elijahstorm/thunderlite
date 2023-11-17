import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import type postgres from 'postgres'

type QueryType = 'public' | 'friends' | 'following' | 'followers'

const query: (type: QueryType) => (
	sql: postgres.Sql,
	props: {
		page?: number
	},
	me?: string
) => Promise<{ users: UserDBData[] }> =
	(type) =>
	async (sql, { page }, me = '') => {
		let users: UserDBData[]
		const limit = 10

		try {
			users = await sql`
            select users.*,
                exists(select 1 from follows where source = ${me} and target = users.auth) as following,
                exists(select 1 from follows where source = users.auth and target = ${me}) as follower,
				coalesce(count(messages.message), 0) as message_count,
				json_build_object(
					'message', max(messages.message),
					'when', max(messages.created_at)
				) AS last_message,
                relationships.status as relationship
            from users
                left join relationships on source = ${me} and target = users.auth
				left join messages on (messages.target = users.auth and messages.source = ${me}) or (messages.target = ${me} and messages.source = users.auth)
            where users.auth != ${me}
				and (${type} != 'public' or private = false and profile_image_url is not null)
				and (${type} != 'friends' or relationships.status = 'friends')
				and (${type} != 'following' or exists(select 1 from follows where source = ${me} and target = users.auth))
				and (${type} != 'followers' or exists(select 1 from follows where source = users.auth and target = ${me}))
			group by relationships.status, users.id
				order by case when relationships.status = 'friends' then 1 else 2 end, message_count desc
                limit ${limit} offset ${(page ?? 0) * limit}`
		} catch (msg) {
			logToErrorDb(sql)(msg)
			throw error(500, 'Could not get map from database')
		}

		return {
			users,
		}
	}

export const queryUsers = query('public')
export const queryFriends = query('friends')
export const queryFollowing = query('following')
export const queryFollowers = query('followers')
