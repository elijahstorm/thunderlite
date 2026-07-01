import { error } from '@sveltejs/kit'
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
		}
	}

	const { gameSession, mapId } = await getGameSession(userSession)
	if (!gameSession || !mapId) throw error(403, 'No game session found')

	return {
		userSession,
		gameSession,
		...(await getMapData(mapId)),
	}
}

const getGameSession = async (userSession: string) => {
	if (dev) {
		return { gameSession: 'testSession', mapId: 'hello' }
	}

	try {
		const current = await gameStore.currentGame(userSession)
		if (!current) return {}
		if (!(await gameStore.isMember(current.session, userSession))) {
			throw error(403, 'You are not a member of this game room')
		}
		return { gameSession: current.session, mapId: current.mapId }
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not load game session')
	}
}
