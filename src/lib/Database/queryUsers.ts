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
            select
				users.*,
                exists(select 1 from follows where source = ${me} and target = users.auth) as following,
                exists(select 1 from follows where source = users.auth and target = ${me}) as follower,
				relationships.status as relationship,
				json_build_object(
					'message', last_message.message,
					'unread', case when last_message.source != ${me} and last_message.read_at is null then 1 else 0 end,
					'when', last_message.created_at
				) as last_message
            from
				users
			left join
				relationships on source = ${me} and target = users.auth
			left join lateral (
				select
					messages.message,
					messages.source,
					messages.created_at,
					messages.read_at
				from
					messages
				where
					(messages.target = users.auth and messages.source = ${me})
					or (messages.target = ${me} and messages.source = users.auth)
				order by
					messages.created_at desc
				limit 1
			) as last_message on true
            where
				users.auth != ${me}
				and (${type} != 'public' or private = false and profile_image_url is not null)
				and (${type} != 'friends' or relationships.status = 'friends')
				and (${type} != 'following' or exists(select 1 from follows where source = ${me} and target = users.auth))
				and (${type} != 'followers' or exists(select 1 from follows where source = users.auth and target = ${me}))
			order by
				last_message.created_at desc nulls last,
				case when relationships.status = 'friends' then 1 else 2 end
			limit
				${limit}
			offset
				${(page ?? 0) * limit}`
		} catch (msg) {
			logToErrorDb(sql)(msg)
			error(500, 'Could not get users from database');
		}

		return {
			users,
		}
	}

export const queryUsers = query('public')
export const queryFriends = query('friends')
export const queryFollowing = query('following')
export const queryFollowers = query('followers')
