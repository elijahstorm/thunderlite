import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import type postgres from 'postgres'

export const queryUsers: (
	sql: postgres.Sql,
	props: {
		offset?: number
	},
	me?: string
) => Promise<{ users: UserDBData[] }> = async (sql, { offset }, me = '') => {
	let users: UserDBData[]
	const limit = 10

	try {
		users = await sql`
            select users.*,
                exists(select 1 from follows where source = ${me} and target = users.auth) as following,
                exists(select 1 from follows where source = users.auth and target = ${me}) as follower,
                (select count(*) from messages where source = ${me} and target = users.auth) as messageCount,
                relationships.status as relationship
            from users
                left join relationships on source = ${me} and target = users.auth
            where private = false and profile_image_url is not null
                group by maps.id, maps.created_at
                order by maps.created_at asc
                limit ${limit} offset ${(offset ?? 0) * limit}`
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not get map from database')
	}

	if (!users?.length) {
		throw error(400, { message: 'No users found. Try to change your search.' })
	}

	return {
		users,
	}
}

export const queryFriends: (
	sql: postgres.Sql,
	props: {
		offset?: number
	},
	me?: string
) => Promise<{ users: UserDBData[] }> = async (sql, { offset }, me = '') => {
	let users: UserDBData[]
	const limit = 10

	try {
		users = await sql`
            select users.*,
                exists(select 1 from follows where source = ${me} and target = users.auth) as following,
                exists(select 1 from follows where source = users.auth and target = ${me}) as follower,
                (select count(*) from messages where source = ${me} and target = users.auth) as messageCount,
                relationships.status as relationship
            from users
                left join relationships on source = ${me} and target = users.auth
            where relationships.status = 'friends'
                group by maps.id, maps.created_at
                order by maps.created_at asc
                limit ${limit} offset ${(offset ?? 0) * limit}`
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not get map from database')
	}

	if (!users?.length) {
		throw error(400, { message: 'No users found. Try to change your search.' })
	}

	return {
		users,
	}
}

export const queryFollowing: (
	sql: postgres.Sql,
	props: {
		offset?: number
	},
	me?: string
) => Promise<{ users: UserDBData[] }> = async (sql, { offset }, me = '') => {
	let users: UserDBData[]
	const limit = 10

	try {
		users = await sql`
            select users.*,
                exists(select 1 from follows where source = ${me} and target = users.auth) as following,
                exists(select 1 from follows where source = users.auth and target = ${me}) as follower,
                (select count(*) from messages where source = ${me} and target = users.auth) as messageCount,
                relationships.status as relationship
            from users
                left join relationships on source = ${me} and target = users.auth
            where exists(select 1 from follows where source = ${me} and target = users.auth)
                group by maps.id, maps.created_at
                order by maps.created_at asc
                limit ${limit} offset ${(offset ?? 0) * limit}`
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not get map from database')
	}

	if (!users?.length) {
		throw error(400, { message: 'No users found. Try to change your search.' })
	}

	return {
		users,
	}
}

export const queryFollowers: (
	sql: postgres.Sql,
	props: {
		offset?: number
	},
	me?: string
) => Promise<{ users: UserDBData[] }> = async (sql, { offset }, me = '') => {
	let users: UserDBData[]
	const limit = 10

	try {
		users = await sql`
            select users.*,
                exists(select 1 from follows where source = ${me} and target = users.auth) as following,
                exists(select 1 from follows where source = users.auth and target = ${me}) as follower,
                (select count(*) from messages where source = ${me} and target = users.auth) as messageCount,
                relationships.status as relationship
            from users
                left join relationships on source = ${me} and target = users.auth
            where exists(select 1 from follows where source = users.auth and target = ${me})
                group by maps.id, maps.created_at
                order by maps.created_at asc
                limit ${limit} offset ${(offset ?? 0) * limit}`
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not get map from database')
	}

	if (!users?.length) {
		throw error(400, { message: 'No users found. Try to change your search.' })
	}

	return {
		users,
	}
}
