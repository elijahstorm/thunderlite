import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/server-logs'
import { createPool, type QueryResult } from '@vercel/postgres'
import { POSTGRES_URL } from '$env/static/private'

export const getUserDBData = (id: number) =>
	getUserFromQuery(`select * from users where id = ${id}`)

export const getUserDBDataFromAuth = (auth: string) =>
	getUserFromQuery(`select * from users where auth = '${auth}'`)

const getUserFromQuery: (query: string) => Promise<UserDBData> = async (query) => {
	let results: QueryResult

	try {
		const pool = createPool({ connectionString: POSTGRES_URL })
		results = await pool.query(query)
	} catch (msg) {
		logToErrorDb(createPool({ connectionString: POSTGRES_URL }))(msg)
		console.error(msg)
		throw error(500, 'Could not get user from database')
	}

	const user = results?.rows[0]

	if (!user) {
		throw error(400, { message: 'No user found.' })
	}

	return user
}
