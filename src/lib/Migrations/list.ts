import type postgres from 'postgres'
import { CreateUsers } from './create_users.sql'
import { CreateUserStats } from './create_user_stats.sql'
import { CreateMapTypes } from './create_map_types.sql'
import { CreateMaps } from './create_maps.sql'
import { CreateLogs } from './create_logs.sql'
import { CreateInfo } from './create_info.sql'
import { CreateInfoMorphMap } from './create_info_morph_map.sql'
import { CreateShareMorphMap } from './create_share_morph_map.sql'
import { CreateLikes } from './create_likes.sql'
import { CreateRelationships } from './create_relationships.sql'
import { CreateFollows } from './create_follows.sql'
import { CreateMessages } from './create_messages.sql'

export const migrationsList = async (types: postgres.Sql) => {
	const results = []
	const migrations = migrationsInOrder

	console.log('starting migrations')

	for (const [name, migration] of Object.entries(migrations)) {
		console.log('running', name, 'migration')
		const result = await migration(types)
		results.push(result)
	}

	console.log('finished migrations')

	return results
}

const migrationsInOrder = {
	CreateLogs,
	CreateUsers,
	CreateUserStats,
	CreateMapTypes,
	CreateMaps,
	CreateInfo,
	CreateInfoMorphMap,
	CreateShareMorphMap,
	CreateLikes,
	CreateRelationships,
	CreateFollows,
	CreateMessages,
} as const
