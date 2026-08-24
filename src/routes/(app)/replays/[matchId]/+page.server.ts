import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { logToErrorDb } from '$lib/Security/serverLogs'
import { db } from '$lib/dontcode/server'
import { gameStore } from '$lib/Game/store.server'
import { getMapData } from '$lib/Map/hashLoader'
import { queryUsersByAuth } from '$lib/Database/getUserData'
import type { SerializedAction } from '$lib/Engine/Interactor/serializedAction'

/**
 * Replay loader — everything needed to watch a finished online match back:
 * the map to rebuild the starting board and the full `game_event` action log
 * to march through it. Only online matches are reviewable (hotseat/campaign
 * never touch the event log), and only by their own participants: replays
 * expose both sides' fog and stealth play, which spectators never earned.
 *
 * The map id is pinned on `matches.map_id` at settlement; matches recorded
 * before that column existed fall back to the room row, which outlives its
 * logical TTL (expiry is read-side only).
 */

type MatchRow = {
	id: number
	session_id: string | null
	mode: string
	winner_team: number | null
	turns: number
	ended_at: string | null
	map_id: string | null
	rated: boolean | null
}

type PlayerRow = {
	user_auth: string | null
	team: number | null
	outcome: string
}

/** Team-keyed public labels for the replay HUD. */
export type ReplaySeat = { auth: string; name: string; avatarUrl: string | null }

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'User not logged in')

	const matchId = Number(params.matchId)
	if (!Number.isInteger(matchId) || matchId <= 0) throw error(404, 'No such match')

	try {
		const match = await db.findOne<MatchRow>('matches', {
			where: { id: matchId },
			select: ['id', 'session_id', 'mode', 'winner_team', 'turns', 'ended_at', 'map_id', 'rated'],
		})
		if (!match) throw error(404, 'No such match')
		if (match.mode !== 'online' || !match.session_id) {
			throw error(404, 'This match has no replay')
		}

		const players = await db.find<PlayerRow>('match_players', {
			where: { match_id: matchId },
			select: ['user_auth', 'team', 'outcome'],
		})
		if (!players.some((p) => p.user_auth === locals.user)) {
			throw error(403, 'Replays are visible to their players only')
		}

		// Prefer the pinned map id; fall back to the room row for legacy matches.
		let mapId = match.map_id
		if (!mapId) {
			const room = await db.findOne<{ map_id: string | null }>('game_room', {
				where: { session: match.session_id },
				select: ['map_id'],
			})
			mapId = room?.map_id ?? null
		}
		if (!mapId) throw error(404, 'The map for this match is no longer available')

		const [{ mapHash, mapName }, log] = await Promise.all([
			getMapData(mapId),
			gameStore.events(match.session_id, -1),
		])
		if (log.events.length === 0) {
			throw error(404, 'The move log for this match is no longer available')
		}

		// Team-keyed names/avatars for the playback HUD. A team without a
		// resolvable profile is simply absent and the HUD shows a generic label.
		const auths = players.map((p) => p.user_auth).filter((a): a is string => !!a)
		const profiles = await queryUsersByAuth(auths, '')
		const byAuth = new Map(profiles.map((p) => [p.auth, p]))
		const seats: Record<number, ReplaySeat> = {}
		for (const player of players) {
			if (player.team == null || !player.user_auth) continue
			const profile = byAuth.get(player.user_auth)
			seats[Number(player.team)] = {
				auth: player.user_auth,
				name: profile?.display_name || profile?.username || 'Unknown player',
				avatarUrl: profile?.profile_image_url ?? null,
			}
		}

		return {
			matchId,
			mapHash,
			mapName,
			actions: log.events.map((e) => e.action) as SerializedAction[],
			seats,
			winnerTeam: match.winner_team == null ? null : Number(match.winner_team),
			rated: !!match.rated,
			endedAt: match.ended_at ?? null,
		}
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		await logToErrorDb(msg)
		throw error(500, 'Could not load the replay')
	}
}
