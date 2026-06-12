import { CreateProfiles } from './create_users.sql'
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
import { CreateMatches } from './create_matches.sql'
import { CreateMatchPlayers } from './create_match_players.sql'
import { CreateCampaignProgress } from './create_campaign_progress.sql'

/**
 * The full app schema as ONE consolidated SQL script for the DontCode
 * `migrate()` endpoint: idempotent `create table if not exists` statements in
 * dependency order — no DO blocks, no dynamic SQL, nothing the platform's
 * migration validator rejects. The platform owns the `users` table (auth
 * service), so app profile data lives in `profiles` and every former
 * `users(auth)` FK now points at `profiles(auth)`.
 */
export const consolidatedSchema = [
	CreateLogs,
	CreateProfiles,
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
	CreateMatches,
	CreateMatchPlayers,
	CreateCampaignProgress,
]
	.map((statement) => statement.trim())
	.join('\n\n')

/** Every app-owned table, in dependency order (parents first). */
export const appTables = [
	'logs',
	'profiles',
	'user_stats',
	'map_types',
	'maps',
	'info',
	'info_morph_map',
	'share_morph_map',
	'likes',
	'relationships',
	'follows',
	'messages',
	'matches',
	'match_players',
	'campaign_progress',
] as const

/**
 * Explicit drops for `resetTables` (dev only) — children first, one statement
 * per app table. Never touches the platform's `users` table.
 */
export const dropAllTablesSql = [...appTables]
	.reverse()
	.map((table) => `drop table if exists ${table} cascade;`)
	.join('\n')
