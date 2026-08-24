import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { gameStore, roomCapacity } from '$lib/Game/store.server'
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
	/** Live rooms: has this seat confirmed it's at the keyboard? CPU seats never
	 * need to (they have no client), so they read as ready. */
	ready: boolean
	user: UserDBData | null
}

/**
 * Pre-game lobby for a single room. Members wait here while the room fills, pick
 * their side (or the host arranges seats / reserves AI), and once it's full AND
 * every human has readied up a 10s countdown opens `/play`. A member who lands
 * here after the match already started is forwarded straight into `/play`.
 *
 * Async rooms skip the ready gate: their players are expected to be away, so
 * those lobbies release as soon as the room fills.
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
		teams = await teamsFromHash(mapHash)
		mapName = meta?.name ?? mapName
		thumbnail = meta?.thumbnail ?? null
	} catch (msg) {
		await logToErrorDb(msg)
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
		ready: s.isAi || s.ready,
		user: s.userAuth ? (byAuth.get(s.userAuth) ?? null) : null,
	}))

	// Readiness summary for the lobby's gate copy. Humans only: a CPU seat has no
	// client to confirm with, so it is never something the room waits on.
	const humans = seats.filter((s) => !s.isAi)
	const readyCount = humans.filter((s) => s.ready).length
	// One seat per side the map fields — a three-side board is a three-seat room.
	const maxPlayers = roomCapacity(room)
	const isAsync = room.mode === 'async'

	return {
		session,
		mapId: room.map_id,
		mapName,
		thumbnail,
		seat,
		isHost: seat === 0,
		count,
		maxPlayers,
		startAt: room.start_at ?? null,
		// Host-chosen at creation, immutable after: 'live' or 'async', plus the
		// async per-turn clock for the lobby copy.
		mode: isAsync ? ('async' as const) : ('live' as const),
		// The host can launch a room that never filled — every side nobody took is
		// handed to the CPU. Correspondence rooms have no CPU seats (an offline
		// driver would just let the AI's clock run out), so they still need a full
		// house before anything can start.
		canFillWithAi: !isAsync,
		canHostStart: isAsync ? count >= maxPlayers : humans.length > 0 && readyCount === humans.length,
		turnTimeoutMs: room.turn_timeout_ms == null ? null : Number(room.turn_timeout_ms),
		// Live rooms gate the countdown on ready-up; async rooms don't.
		requiresReady: room.mode !== 'async',
		myReady: seats.find((s) => s.userSession === userSession)?.ready ?? false,
		readyCount,
		humanCount: humans.length,
		teams,
		lockRandom: !!room.lock_random,
		members,
		// Seat-indexed profiles kept for the group chat (author names).
		roster: [...seats]
			.sort((a, b) => a.seat - b.seat)
			.map((s) => (s.userAuth ? (byAuth.get(s.userAuth) ?? null) : null)),
	}
}
