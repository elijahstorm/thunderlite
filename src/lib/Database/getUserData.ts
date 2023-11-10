import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import type postgres from 'postgres'

export const getUserDBData = (id: number) => getUserFromQuery('id', `${id}`)

export const getUserDBDataFromAuth = (auth: string) => getUserFromQuery('auth', auth)

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

const getUserFromQuery: (
	query: 'auth' | 'id',
	auth: string
) => (sql: postgres.Sql) => Promise<UserDBData> = (query, auth) => async (sql: postgres.Sql) => {
	let user: UserDBData

	try {
		if (query === 'auth') {
			user = (await sql`select * from users where auth = ${auth}`)[0] as UserDBData
		} else {
			user = (await sql`select * from users where id = ${auth}`)[0] as UserDBData
		}
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not get user from database')
	}

	if (!user) {
		throw error(400, { message: 'No user found.' })
	}

	return user
}
