import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { POSTGRES_URL } from '$env/static/private'
import { createPool } from '@vercel/postgres'

export const load: PageServerLoad = async ({ params }) => {
	const pool = createPool({ connectionString: POSTGRES_URL })

	const results = await pool.query(`SELECT url from Maps where sha='${params.sha}'`)
	const url = results.rows[0]?.url

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
