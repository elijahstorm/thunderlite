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
import { CreateMessages } from './create_messages.sql'
import { CreateMatches } from './create_matches.sql'
import { CreateMatchPlayers } from './create_match_players.sql'
import { CreateMatchHistory } from './create_match_history.sql'
import { CreateMatchAnchor } from './create_match_anchor.sql'
import { CreateCampaignProgress } from './create_campaign_progress.sql'
import { CreateGameRoom } from './create_game_room.sql'
import { CreateGameRoomSettings } from './create_game_room_settings.sql'
import { CreateGameRoomStanding } from './create_game_room_standing.sql'
import { CreateGameMember } from './create_game_member.sql'
import { CreateGameEvent } from './create_game_event.sql'
import { CreateGameEventOrdering } from './create_game_event_ordering.sql'
import { CreateGameEventSpan } from './create_game_event_span.sql'
import { CreateGameLog } from './create_game_log.sql'
import { CreateGameAsync } from './create_game_async.sql'
import { CreateGameReady } from './create_game_ready.sql'
import { CreateGameCapacity } from './create_game_capacity.sql'
import { CreateGameSeed } from './create_game_seed.sql'
import { CreatePlayerGame } from './create_player_game.sql'
import { CreateEmailLog } from './create_email_log.sql'
import { CreateNotificationPrefs } from './create_notification_prefs.sql'
import { DropFollows } from './drop_follows.sql'

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
	CreateMessages,
	CreateMatches,
	CreateMatchPlayers,
	// After CreateMatchPlayers: its alters target matches + match_players.
	CreateMatchHistory,
	// After CreateMatches: its alter targets matches.
	CreateMatchAnchor,
	CreateCampaignProgress,
	CreateGameRoom,
	CreateGameRoomSettings,
	// After CreateGameRoom: its alter targets game_room.
	CreateGameRoomStanding,
	CreateGameMember,
	CreateGameEvent,
	// After CreateGameEvent: its alters target game_event.
	CreateGameEventOrdering,
	CreateGameEventSpan,
	CreateGameLog,
	// After CreateGameMember: its index targets game_member.
	CreateGameAsync,
	CreateGameReady,
	CreateGameCapacity,
	// After CreateGameRoom + CreateMatches: its alters target both.
	CreateGameSeed,
	CreatePlayerGame,
	CreateEmailLog,
	CreateNotificationPrefs,
	// Drops come last, after every create: `follows` was retired (see the file).
	DropFollows,
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
	'messages',
	'matches',
	'match_players',
	'campaign_progress',
	'game_room',
	'game_member',
	'game_event',
	'game_log',
	'player_game',
	'email_log',
	'notification_prefs',
] as const

/**
 * Explicit drops for the `pnpm db:reset` CLI (scripts/reset.ts) — children
 * first, one statement per app table. Never touches the platform's `users`
 * table.
 */
export const dropAllTablesSql = [...appTables]
	.reverse()
	.map((table) => `drop table if exists ${table} cascade;`)
	.join('\n')
