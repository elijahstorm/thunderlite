import { error } from '@sveltejs/kit'
import { POSTGRES_URL } from '$env/static/private'
import { createPool, type QueryResult } from '@vercel/postgres'
import { logToErrorDb } from '$lib/Security/server-logs'

export const getMapHash = async (sha: string) => {
	let results: QueryResult

	try {
		const pool = createPool({ connectionString: POSTGRES_URL })
		results = await pool.query(`select url from maps where sha='${sha}'`)
	} catch (msg) {
		logToErrorDb(createPool({ connectionString: POSTGRES_URL }))(msg)
		throw error(500, 'Could not get map from database')
	}

	const url = results?.rows[0]?.url
	if (!url) {
		throw error(400, { message: 'No map with that SHA found.' })
	}

	const mapResponse = await fetch(url)

	if (!mapResponse.ok) {
		throw error(404, 'No map data found')
	}

	const mapHash = await mapResponse.text()

	return { mapHash }
}

export const isValidMapHash = async (sha: string) => {
	let exists = false

	try {
		const pool = createPool({ connectionString: POSTGRES_URL })
		const results = await pool.query(`select count(url) from maps where sha='${sha}'`)
		exists = results.rows[0]?.count !== '0'
	} catch (msg) {
		logToErrorDb(createPool({ connectionString: POSTGRES_URL }))(msg)
		throw error(500, 'Could not perform count check on database')
	}

	if (!exists) {
		throw error(400, { message: 'No map with that SHA found.' })
	}

	return true
}
