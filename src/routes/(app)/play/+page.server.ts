import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { dev } from '$app/environment'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { getMapData } from '$lib/Map/hashLoader'
import { gameStore } from '$lib/Game/store.server'

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
		}
	}

	const { gameSession, mapId, seat } = await getGameSession(userSession)
	if (!gameSession || !mapId) throw error(403, 'No game session found')

	return {
		userSession,
		gameSession,
		// The join seat (0 = host) selects which side this client commands — the
		// engine derives sides from the map in a stable order, so seat N drives
		// player N. Without it both clients defaulted to team 0.
		seat,
		...(await getMapData(mapId)),
	}
}

const getGameSession = async (userSession: string) => {
	if (dev) {
		return { gameSession: 'testSession', mapId: 'hello', seat: 0 }
	}

	try {
		const current = await gameStore.currentGame(userSession)
		if (!current) return {}
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
