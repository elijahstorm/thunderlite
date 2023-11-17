import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import type postgres from 'postgres'

export const queryUsers: (
	sql: postgres.Sql,
	props: {
		page?: number
	},
	me?: string
) => Promise<{ users: UserDBData[] }> = async (sql, { page }, me = '') => {
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
            where private = false and profile_image_url is not null
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

export const queryFriends: (
	sql: postgres.Sql,
	props: {
		page?: number
	},
	me?: string
) => Promise<{ users: UserDBData[] }> = async (sql, { page }, me = '') => {
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
            where relationships.status = 'friends'
				group by relationships.status, users.id
				order by case when relationships.status = 'friends' then 1 else 2 end, message_count desc
				limit ${limit} offset ${(page ?? 0) * limit}`
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not get map from database')

		console.log(users)
	}

	return {
		users,
	}
}

export const queryFollowing: (
	sql: postgres.Sql,
	props: {
		page?: number
	},
	me?: string
) => Promise<{ users: UserDBData[] }> = async (sql, { page }, me = '') => {
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
            where exists(select 1 from follows where source = ${me} and target = users.auth)
				group by relationships.status, users.id
				order by case when relationships.status = 'friends' then 1 else 2 end, message_count desc
				limit ${limit} offset ${(page ?? 0) * limit}`
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not get map from database')
	}

	console.log(users)

	return {
		users,
	}
}

export const queryFollowers: (
	sql: postgres.Sql,
	props: {
		page?: number
	},
	me?: string
) => Promise<{ users: UserDBData[] }> = async (sql, { page }, me = '') => {
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
            where exists(select 1 from follows where source = users.auth and target = ${me})
				group by relationships.status, users.id
				order by case when relationships.status = 'friends' then 1 else 2 end, message_count desc
				limit ${limit} offset ${(page ?? 0) * limit}`
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not get map from database')

		console.log(users)
	}

	return {
		users,
	}
}
