import { error } from '@sveltejs/kit'
import { getUserDBDataFromAuth } from './getUserData'
import { logToErrorDb } from '$lib/Security/serverLogs'
import type postgres from 'postgres'

export const queryMaps: (
	sql: postgres.Sql,
	props: {
		search?: string
		type?: string
		page?: number
	},
	me?: string
) => Promise<{ maps: MapDBData[]; users: UserDBData[] }> = async (
	sql,
	{ search = '', type = '', page = 0 },
	me = ''
) => {
	let maps: MapDBData[]
	const limit = 10

	try {
		maps = await sql`
			select
				maps.*,
				map_types.text as type,
				coalesce(
					array(
						select json_build_object('info', info.info, 'color', info.color)
						from info_morph_map
						left join info ON info.id = info_morph_map.info_id
						where info_morph_map.entity_id = Maps.id and info_morph_map.entity_type = 'maps'
					),
					array[]::json[]
				) as info,
				count(distinct likes.id) as likes,
				count(distinct share_morph_map.id) as shares,
				case when maps.created_at >= now() - interval '1 month' then true else false end as trending,
				case when max(case when likes.user_auth = ${me} then 1 else 0 end) = 1 then true else false end as liked_by_me
			from
				maps
			left join
				map_types on maps.map_type_id = map_types.id
			left join
				likes on maps.id = likes.map_id
			left join
				share_morph_map on share_morph_map.entity_type = 'map' and maps.id = share_morph_map.entity_id
			where
				maps.status != 'private'
				and (${type} = '' or map_types.text = ${type})
				and (${search} = '' or (maps.name ilike ${`%${search}%`} or maps.description ilike ${`%${search}%`}))
			group by
				maps.id,
				map_types.text
			order by
				maps.created_at asc
			limit
				${limit}
			offset
				${page * limit}`
	} catch (msg) {
		logToErrorDb(sql)(msg)
		error(500, 'Could not get map from database');
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
