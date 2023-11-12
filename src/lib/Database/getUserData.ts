import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import type postgres from 'postgres'

export const getUserDBDataFromAuth = async (sql: postgres.Sql, auth: string, me: string = '') => {
	let user: UserDBData

	try {
		user = (
			await sql`
				select users.*,
					exists(select 1 from follows where source = ${me} and target = users.auth) as following,
					exists(select 1 from follows where source = users.auth and target = ${me}) as follower,
					(select count(*) from messages where source = ${me} and target = users.auth) as messageCount,
					relationships.status as relationship
				from users
					left join relationships on source = ${me} and target = users.auth
				where auth = ${auth}`
		)[0] as UserDBData
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not get user from database')
	}

	if (!user) {
		throw error(400, { message: 'No user found.' })
	}

	return user
}

export const makeUserDBDataFromAuth = (auth: string) => async (sql: postgres.Sql) => {
	try {
		await sql`insert into users ${sql({ auth }, 'auth')}`
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not make user')
	}
}

export const updateUserDBData =
	(auth: string, user: UserDBData, entries: (keyof UserDBData)[]) => async (sql: postgres.Sql) => {
		try {
			await sql`update users set ${sql(user, ...entries)} where auth = ${auth}`
		} catch (msg) {
			logToErrorDb(sql)(msg)
			throw error(500, 'Could not make user')
		}
	}
