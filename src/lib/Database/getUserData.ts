import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/server-logs'
import { createPool } from '@vercel/postgres'
import postgres from 'postgres'
import { LOCAL_POSTGRES, POSTGRES_URL, VERCEL_ENV } from '$env/static/private'

export const getUserDBData = (id: number) => getUserFromQuery('id', `${id}`)

export const getUserDBDataFromAuth = (auth: string) => getUserFromQuery('auth', auth)

const getUserFromQuery: (query: 'auth' | 'id', auth: string) => Promise<UserDBData> = async (
	query,
	auth
) => {
	let user: UserDBData

	try {
		if (VERCEL_ENV === 'development') {
			const sql = postgres(LOCAL_POSTGRES)
			if (query === 'auth') {
				user = (await sql`select * from users where auth = ${auth}`)[0] as UserDBData
			} else {
				user = (await sql`select * from users where id = ${auth}`)[0] as UserDBData
			}
		} else {
			const pool = createPool({ connectionString: POSTGRES_URL })
			user = (await pool.query(`select * from users where ${query} = ${auth}`))?.rows[0]
		}
	} catch (msg) {
		logToErrorDb(createPool({ connectionString: POSTGRES_URL }))(msg)
		throw error(500, 'Could not get user from database')
	}

	if (!user) {
		throw error(400, { message: 'No user found.' })
	}

	return user
}
