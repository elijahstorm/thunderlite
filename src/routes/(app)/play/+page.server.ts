import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { dev } from '$app/environment'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { getMapData } from '$lib/Map/hashLoader'
import { gameStore } from '$lib/Game/store.server'
import { queryUsersByAuth } from '$lib/Database/getUserData'

export const load: PageServerLoad = async ({ locals, url }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	// Ephemeral session: the editor launched an unsaved map. The client-side
	// `mapStore` carries the whole board across navigation (no map id, nothing
	// stuffed in the URL), and `MapLoader` prefers `$mapStore` over `mapHash`, so
	// this renders from memory. A hard reload with an empty store has nothing to
	// show — the editor is the source of truth for an unsaved map.
	if (url.searchParams.get('ephemeral') === '1') {
		return {
			userSession,
			gameSession: 'ephemeral',
			mapHash: '',
			seat: 0,
			roster: [] as (UserDBData | null)[],
		}
	}

	const { gameSession, mapId, seat } = await getGameSession(userSession)
	if (!gameSession || !mapId) throw error(403, 'No game session found')

	// Independent reads — the map blob and the seat roster don't depend on each
	// other, so resolve them together rather than back to back.
	const [mapData, roster] = await Promise.all([
		getMapData(mapId),
		buildRoster(gameSession, locals.user ?? ''),
	])

	return {
		userSession,
		gameSession,
		// The join seat (0 = host) selects which side this client commands — the
		// engine derives sides from the map in a stable order, so seat N drives
		// player N. Without it both clients defaulted to team 0.
		seat,
		// Public profiles indexed by seat, so the in-game player list can show
		// usernames + avatars. The client maps seat → team (same stable order the
		// seat wiring uses) to key it by team. Null for an unresolvable seat.
		roster,
		...mapData,
	}
}

/**
 * Seat-ordered public profiles for the room's players. Index = seat; a seat with
 * no recorded/resolvable profile (a legacy row, or a member whose profile was
 * removed) is null, and the player list falls back to "Player N" for it.
 */
const buildRoster = async (
	gameSession: string,
	me: string
): Promise<(UserDBData | null)[]> => {
	// The dev `testSession` has no member rows — surface the signed-in user as
	// seat 0 so the list still shows a real name/avatar while testing locally.
	if (gameSession === 'testSession') {
		if (!me) return [null]
		const [user] = await queryUsersByAuth([me], me)
		return [user ?? null]
	}

	try {
		const seats = await gameStore.roster(gameSession)
		const auths = seats.map((s) => s.userAuth).filter((a): a is string => !!a)
		const byAuth = new Map((await queryUsersByAuth(auths, me)).map((u) => [u.auth, u]))
		return [...seats]
			.sort((a, b) => a.seat - b.seat)
			.map((s) => (s.userAuth ? (byAuth.get(s.userAuth) ?? null) : null))
	} catch (msg) {
		// A roster failure must never take down the match — degrade to "Player N".
		logToErrorDb(msg)
		return []
	}
}

const getGameSession = async (userSession: string) => {
	try {
		const current = await gameStore.currentGame(userSession)
		if (!current) {
			// No active room. In dev, fall back to a fixed local skirmish so hitting
			// `/play` directly still boots a board. In prod there's nothing to show.
			// NB: this fallback must only fire when there's genuinely no room —
			// firing it unconditionally in dev made every client seat 0 on a
			// non-multiplayer `testSession`, so two lobby players both drove player 1
			// and never synced.
			if (dev) return { gameSession: 'testSession', mapId: 'hello', seat: 0 }
			return {}
		}
		const seat = await gameStore.seatOf(current.session, userSession)
		if (seat < 0) {
			throw error(403, 'You are not a member of this game room')
		}
		// The match hasn't been released by the lobby yet — send the player back to
		// the lobby (where the fill/countdown plays out) instead of dropping them
		// into an empty board that would end the instant win conditions evaluate.
		// `currentGame` already fetched the room, so reuse it here.
		const room = current.room
		if (!room || room.start_at == null || room.start_at > Date.now()) {
			throw redirect(303, `/rooms/${current.session}`)
		}
		return { gameSession: current.session, mapId: current.mapId, seat }
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not load game session')
	}
}
