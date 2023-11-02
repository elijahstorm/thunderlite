import { error } from '@sveltejs/kit'
import { createPool, type QueryResult } from '@vercel/postgres'
import { POSTGRES_URL } from '$env/static/private'
import { getUserDBData } from './getUserData'
import { logToErrorDb } from '$lib/Security/server-logs'

export const queryMaps: (props: {
	offset?: number
}) => Promise<{ maps: MapDBData[]; users: UserDBData[] }> = async ({ offset }) => {
	let results: QueryResult
	const where = `status is null or status != 'private'`
	const limit = 10
	const user_id = 1
	const query = `
		select maps.*,
			count(distinct likes.id) as likes,
			count(distinct share_morph_map.id) as shares,
			case when maps.created_at >= now() - interval '1 month' then true else false end as trending,
			case when max(case when likes.user_id = ${user_id} then 1 else 0 end) = 1 then true else false end as liked_by_me
		from maps
			left join likes on maps.id = likes.map_id
			left join share_morph_map on share_morph_map.entity_type = 'map' and maps.id = share_morph_map.entity_id
		where ${where}
			group by maps.id, maps.created_at
			order by maps.created_at asc
			limit ${limit} offset ${(offset ?? 0) * limit}`

	try {
		const pool = createPool({ connectionString: POSTGRES_URL })
		results = await pool.query(query)
	} catch (msg) {
		logToErrorDb(createPool({ connectionString: POSTGRES_URL }))(msg)
		throw error(500, 'Could not get map from database')
	}

	const maps = results?.rows as MapDBData[]

	if (!maps?.length) {
		throw error(400, { message: 'No maps found. Try to change your search.' })
	}

	const users = await Promise.all(
		maps.reduce((users, map) => {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			if (users[map.owner_id]) return users
			users[map.owner_id] = getUserDBData(map.owner_id)
			return users
		}, [] as Promise<UserDBData>[])
	)

	return {
		maps,
		users,
	}
}
