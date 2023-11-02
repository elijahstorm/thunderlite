import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/server-logs'
import { createPool, type QueryResult } from '@vercel/postgres'
import { POSTGRES_URL } from '$env/static/private'

export const getUserDBData: (id: number) => Promise<UserDBData> = async (id) => {
	let results: QueryResult
	const query = `select * from users where id = ${id}`

	try {
		const pool = createPool({ connectionString: POSTGRES_URL })
		results = await pool.query(query)
	} catch (msg) {
		logToErrorDb(createPool({ connectionString: POSTGRES_URL }))(msg)
		console.error(msg)
		throw error(500, 'Could not get map from database')
	}

	const user = results?.rows[0]

	if (!user) {
		throw error(400, { message: 'No user found.' })
	}

	return user
}
