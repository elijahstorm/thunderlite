import { error } from '@sveltejs/kit'
import { getUserDBDataFromAuth } from './getUserData'
import { logToErrorDb } from '$lib/Security/serverLogs'
import type postgres from 'postgres'

export const queryMaps: (
	sql: postgres.Sql,
	props: {
		offset?: number
	},
	me?: string
) => Promise<{ maps: MapDBData[]; users: UserDBData[] }> = async (sql, { offset }, me = '') => {
	let maps: MapDBData[]
	const limit = 10

	try {
		maps = await sql`
			select maps.*,
				count(distinct likes.id) as likes,
				count(distinct share_morph_map.id) as shares,
				case when maps.created_at >= now() - interval '1 month' then true else false end as trending,
				case when max(case when likes.user_auth = ${me} then 1 else 0 end) = 1 then true else false end as liked_by_me
			from maps
				left join likes on maps.id = likes.map_id
				left join share_morph_map on share_morph_map.entity_type = 'map' and maps.id = share_morph_map.entity_id
			where status is null or status != 'private'
				group by maps.id, maps.created_at
				order by maps.created_at asc
				limit ${limit} offset ${(offset ?? 0) * limit}`
	} catch (msg) {
		logToErrorDb(sql)(msg)
		throw error(500, 'Could not get map from database')
	}

	if (!maps?.length) {
		throw error(400, { message: 'No maps found. Try to change your search.' })
	}

	const users = (await Promise.all(
		Object.values(
			maps.reduce(
				(users, map) => {
					if (users[map.owner_auth]) return users
					users[map.owner_auth] = getUserDBDataFromAuth(sql, map.owner_auth, me)
					return users
				},
				{} as { [key: string]: Promise<UserDBData> | undefined }
			)
		)
	)) as UserDBData[]

	return {
		maps,
		users,
	}
}
