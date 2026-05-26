import { error } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import type postgres from 'postgres'

export const getMapHash = async (sql: postgres.Sql, sha: string) => {
	let map: MapDBData[]

	try {
		map = await sql`select url from maps where sha = ${sha}`
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not get map from database')
	}

	const url = map[0]?.url
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

export const isValidMapHash = async (sql: postgres.Sql, sha: string) => {
	try {
		const results = await sql<{ count: number | bigint }[]>`
			select count(url) from maps where sha = ${sha}
		`
		return Number(results[0]?.count ?? 0) > 0
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not perform count check on database')
	}
}
