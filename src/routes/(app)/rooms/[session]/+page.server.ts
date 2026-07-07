import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { gameStore, MAX_PLAYERS } from '$lib/Game/store.server'
import { queryUsersByAuth } from '$lib/Database/getUserData'
import { getMapData } from '$lib/Map/hashLoader'
import { teamsFromHash } from '$lib/Game/mapTeams'
import { db } from '$lib/dontcode/server'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

export type LobbyMember = {
	userSession: string
	seat: number
	team: number | null
	isAi: boolean
	isMe: boolean
	user: UserDBData | null
}

/**
 * Pre-game lobby for a single room. Members wait here while the room fills, pick
 * their side (or the host arranges seats / reserves AI), and once it's full a
 * 10s countdown opens `/play`. A member who lands here after the match already
 * started is forwarded straight into `/play`.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	const session = params.session
	const [room, seat, count, seats] = await Promise.all([
		gameStore.getRoom(session),
		gameStore.seatOf(session, userSession),
		gameStore.memberCount(session),
		gameStore.roster(session),
	])
	if (!room) throw redirect(303, '/rooms')
	if (seat < 0) throw redirect(303, '/rooms')

	// Already started — the lobby is done; drop the member into the game.
	if (room.start_at != null && room.start_at <= Date.now()) throw redirect(303, '/play')

	// Map sides (for seat selection) + name/thumbnail (for the preview).
	let teams: number[] = []
	let mapName = 'Custom map'
	let thumbnail: string | null = null
	try {
		const [{ mapHash }, meta] = await Promise.all([
			getMapData(room.map_id),
			db.findOne<{ name: string; thumbnail: string | null }>('maps', {
				where: { public_id: room.map_id },
				select: ['name', 'thumbnail'],
			}),
		])
		teams = teamsFromHash(mapHash)
		mapName = meta?.name ?? mapName
		thumbnail = meta?.thumbnail ?? null
	} catch (msg) {
		logToErrorDb(msg)
	}

	// Hydrate members with profiles.
	const auths = seats.map((s) => s.userAuth).filter((a): a is string => !!a)
	const byAuth = new Map(
		(await queryUsersByAuth(auths, locals.user ?? '').catch(() => [])).map((u) => [u.auth, u])
	)
	const members: LobbyMember[] = seats.map((s) => ({
		userSession: s.userSession,
		seat: s.seat,
		team: s.team,
		isAi: s.isAi,
		isMe: s.userSession === userSession,
		user: s.userAuth ? (byAuth.get(s.userAuth) ?? null) : null,
	}))

	return {
		session,
		mapId: room.map_id,
		mapName,
		thumbnail,
		seat,
		isHost: seat === 0,
		count,
		maxPlayers: MAX_PLAYERS,
		startAt: room.start_at ?? null,
		teams,
		lockRandom: !!room.lock_random,
		members,
		// Seat-indexed profiles kept for the group chat (author names).
		roster: [...seats].sort((a, b) => a.seat - b.seat).map((s) => (s.userAuth ? (byAuth.get(s.userAuth) ?? null) : null)),
	}
}
